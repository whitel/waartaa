Meteor.startup(function () {
    WHO_DATA_POLL_LOCK = {};
});

if (typeof(logger) == 'undefined')
    logger = Winston;

GLOBAL_LISTENERS = {};
RECENT_CHANNEL_LOGS = {};
CHANNEL_LOGS_WRITE_LOCKS = {};
channel_nicks_manager = ChannelNicksManager();
channel_listeners_manager = ChannelListenersManager();
channelLogsManager = ChannelLogsManager();

Meteor.startup(function () {
  channelLogsManager.cleanup();
  var task_id = Meteor.setInterval(
    channelLogsManager.cleanup,
    CONFIG.CHANNEL_LOGS_CLEANUP_INTERVAL
  );
});

IRCHandler = function (user, user_server) {
    var client_data = {};
    var client = null;
    var user_status = "";
    var channels_listening_to = {};
    var LISTENERS = {
        server: {},
        channel: {}
    };
    var JOBS = {};

    /* Event listener callbacks */

    function _addServerQuitListener () {
        if (LISTENERS.server['quit'] != undefined)
            return;
        LISTENERS.server['quit'] = '';
        client.addListener('quit', function (nick, reason, channels, message) {
            channel_listeners_manager.removeNickFromChannels(
                user_server.name, channels, nick);
            enqueueTask(URGENT_QUEUE, function () {
                Fiber(function () {
                    UserChannels.find({
                        user_server_name: user_server.name,
                        user: user.username, name: {$in: channels}
                    }).forEach(function (channel) {
                        var part_message = "";
                        //if (nick == client.nick)
                        //    part_message = 'You have left IRC';
                        //else
                        part_message = nick + ' has left IRC';
                        if (reason)
                            part_message += ' (' + reason + ')';
                        channel_nicks_manager.removeChannelNick(
                            channel.user_server_name, channel.name, nick);
                        enqueueTask(URGENT_QUEUE, function () {
                            Fiber(function () {
                                channelLogsManager.insertIfNeeded({
                                    message: part_message,
                                    raw_message: message,
                                    from: null,
                                    from_user: null,
                                    from_user_id: null,
                                    nick: nick,
                                    channel_name: channel.name,
                                    channel_id: channel._id,
                                    server_name: user_server.name,
                                    server_id: user_server._id,
                                    user: user.username,
                                    user_id: user._id,
                                    created: new Date(),
                                    last_updated: new Date(),
                                    type: 'QUITIRC',
                                    global: true
                                }, client.nick);
                            }).run();
                        });
                    });
                }).run();
            });
        });
    }

    function _addChannelTopicListener () {
        if (LISTENERS.server['topic'] != undefined)
            return;
        LISTENERS.server['topic'] = '';
        client.addListener('topic', function (channel, topic, nick, message) {
            enqueueTask(URGENT_QUEUE, function () {
                Fiber(function () {
                    UserChannels.update({
                        name: channel, user_server_id: user_server._id,
                        user: user.username
                    }, {$set: {topic: topic}});
                }).run();
            });
        });
    }

    function _addSelfMessageListener (argument) {
        client.addListener('selfMessageSent', function (target, message) {
        })
    }

    function _addWhoisListener (info) {
    }

    function _addNickChangeListener () {
        if (LISTENERS.server['nick'] != undefined)
            return;
        LISTENERS.server['nick'] = '';
        // Remove any pre existing NICK listener
        _.each(client.listeners('nick'), function (listener) {
            client.removeListener('nick', listener);
        });
        client.addListener('nick', function (
                oldnick, newnick, channels, message) {
            // Update channel nick from old nick to new nick
            enqueueTask(DELAYED_QUEUE, function () {
                Fiber(function () {
                    try {
                        ChannelNicks.update(
                            {
                                nick: oldnick, channel_name: {$in: channels},
                                server_name: user_server.name
                            },
                            {$set: {nick: newnick}},
                            {multi: true},
                            function (err, updated) {}
                        );
                    } catch (err) {
                        logger.info('ChannelNicksUpsertError', {error: err});
                    }
                }).run();
            });

            enqueueTask(DELAYED_QUEUE, function () {
                // Log nick change for active and connected user channels.
                Fiber(function () {
                    UserChannels.find(
                        {
                            user_server_id: user_server._id, name: {$in: channels},
                            active: true, status: 'connected'
                        }
                    ).forEach(function (channel) {
                        channelLogsManager.insertIfNeeded({
                            message: oldnick + ' has changed nick to ' + newnick,
                            raw_message: '',
                            from: '',
                            from_user: null,
                            from_user_id: null,
                            nick: nick,
                            channel_name: channel.name,
                            channel_id: channel._id,
                            server_name: user_server.name,
                            server_id: user_server._id,
                            user: user.username,
                            user_id: user._id,
                            created: new Date(),
                            last_updated: new Date(),
                            type: 'NICK',
                            global: true
                        }, client.nick);
                    });
                }).run();
            });
        })
    }

    function _addPMListener () {
        if (LISTENERS.server['message'] != undefined)
            return;
        LISTENERS.server['message'] = '';
        // Remove any pre existing PM listener
        var listeners = client.listeners('message');
        _.each(listeners, function (listener) {
            client.removeListener('message', listener);
        });
        client.addListener('message', function (nick, to, text, message) {
            //console.log(nick + ', ' + to + ', ' + text + ', ' + message);
            enqueueTask(URGENT_QUEUE, function () {
                Fiber(function () {
                    if (to == client.nick) {
                        var profile = user.profile;
                        var userpms = UserPms.findOne({user_id: user._id}) || {pms: {}};
                        userpms.pms[nick] = "";
                        UserPms.upsert(
                            {user_id: user._id, 
                             user_server_id: user_server._id,
                             user_server_name: user_server.name,
                             user: user.username}, 
                             {$set: {pms: userpms.pms}});

                        var from_user = Meteor.users.findOne({username: nick}) || {};
                        var to_user = user;
                        PMLogs.insert({
                            message: text,
                            raw_message: message,
                            from: nick,
                            display_from: nick,
                            from_user: from_user.username,
                            from_user_id: from_user._id,
                            to_nick: to,
                            to_user: to_user.username,
                            to_user_id: to_user._id,
                            server_name: user_server.name,
                            server_id: user_server._id,
                            user: user.username,
                            user_id: user._id,
                            created: new Date(),
                            last_updated: new Date()
                        }, function (err, id) {});
                        if (_.isUndefined(Meteor.presences.findOne(
                                {userId: user._id}))) {
                            waartaa.notifications.notify_pm(
                                user, nick, text, user_server);
                        }
                    }
                }).run();
            });
        });
    }

    function _addRawMessageListener() {
        client.addListener('raw', function (message) {
            if (CONFIG.DEBUG)
                console.log(message);
        });
    }

    function set_user_away (message) {
        client.send('AWAY', message);
    }

    function set_user_active () {
        client.send('AWAY', '');
    }

    function _pollUserStatus (interval) {
        var job_key = 'POLL_USER_STATUS';
        if (JOBS[job_key])
            Meteor.clearInterval(JOBS[job_key]);
        JOBS[job_key] = Meteor.setInterval(function () {
            var presence = Meteor.presences.findOne({userId: user._id});
            if (presence && user_status != "active") {
                set_user_active();
                user_status = "active";
            }
            else if (_.isUndefined(presence) && user_status != "away") {
                set_user_away("I am not around!");
                user_status = "away";
            }
        }, interval);
    }

    function _joinServerCallback (message) {
        /**
         * It's the responsiblity of the calling function to decide
         * whether to run this inside Fiber or not.
         */
        UserServers.update({_id: user_server._id}, {$set: {
            status: 'connected'}
        });
        _addWhoListener();
        _addServerQuitListener();
        _addChannelTopicListener();
        _addNoticeListener();
        _addCtcpListener();
        _addSelfMessageListener();
        _addPMListener();
        _addNickChangeListener();
        _addRawMessageListener();
        _addGlobalChannelJoinListener();
        _addGlobalChannelNamesListener();
        _pollUserStatus(60 * 1000);
        UserChannels.find(
        {
            active: true, user: user.username,
            status: {$nin: ['user_disconnected', 'admin_disconnected']},
            user_server_name: user_server.name
        }).forEach(function (channel) {
            _addChannelNamesListener(channel.name);
            _addChannelJoinListener(channel.name);
            _addChannelPartListener(channel.name);
            client.join(channel.name, function (message) {
                _joinChannelCallback(message, channel);
            });
        });
        disconnectConnectingChannelsOnTimeout(20000);
        client.addListener('notice', function (nick, to, text, message) {
            if (nick == null) {
                // NOTICE from server
            }
        });
        client.addListener('error', function (err) {
            Fiber(function () {
            }).run();
        });
    }

    function _addNoticeListener () {
        if (LISTENERS.server['notice'] != undefined)
            return;
        LISTENERS.server['notice'] = '';
        client.addListener('notice', function (nick, to, text, message) {
            enqueueTask(URGENT_QUEUE, function () {
                Fiber(function () {
                    if (nick == 'NickServ' || nick == null) {
                        UserServerLogs.insert({
                            message: text,
                            raw_message: message,
                            from: nick,
                            from_user: null,
                            from_user_id: null,
                            server_name: user_server.name,
                            server_id: user_server._id,
                            user: user.username,
                            user_id: user._id,
                            created: new Date(),
                            last_updated: new Date()
                        }, function (err, id) {});
                    } else if (nick == 'ChanServ') {
                        try {
                            var channel_name = text.split(']')[0].substr(1);
                            var channel = UserChannels.findOne({
                                name: channel_name,
                                user_server_id: user_server._id,
                                user: user.username
                            });
                            if (channel)
                                channelLogsManager.insert({
                                    message: text,
                                    raw_message: message,
                                    from: nick,
                                    from_user: null,
                                    from_user_id: null,
                                    nick: nick,
                                    channel_name: channel.name,
                                    channel_id: channel._id,
                                    server_name: user_server.name,
                                    server_id: user_server._id,
                                    user: user.username,
                                    user_id: user._id,
                                    created: new Date(),
                                    last_updated: new Date(),
                                    type: 'ChannelNotice'
                                });
                        } catch (err) {
                        }
                    }
                }).run();
            });
        });
    }

    function _writeChannelActionMessage (channel, from, text, message) {
        var global = true;
        channelLogsManager.insertIfNeeded({
            message: text,
            raw_message: message,
            from: '',
            from_user: user.username,
            from_user_id: user._id,
            nick: from,
            channel_name: channel.name,
            channel_id: channel._id,
            server_name: user_server.name,
            server_id: user_server._id,
            user: user.username,
            user_id: user._id,
            global: global,
            not_for_user: null,
            created: new Date(),
            last_updated: new Date()
        }, client.nick);
    }

    function _addCtcpListener () {
        if (LISTENERS.server['ctcp'] != undefined)
            return;
        LISTENERS.server['ctcp'] = '';
        client.addListener('ctcp', function (from, to, text, type, message) {
            enqueueTask(URGENT_QUEUE, function () {
                Fiber(function () {
                    try {
                        if (type == 'privmsg' && text.search('ACTION') == 0) {
                            text = text.replace('ACTION', from);
                            if (to[0] == '#') {
                                var channel = UserChannels.findOne({
                                    name: to,
                                    user_server_id: user_server._id
                                });
                                if (!channel)
                                    return;
                                    _writeChannelActionMessage(
                                        channel, from, text, message);
                            } else {
                                PMLogs.insert({
                                  message: text,
                                  raw_message: message,
                                  from: from,
                                  display_from: '',
                                  from_user: user.username,
                                  from_user_id: user._id,
                                  to_nick: to,
                                  to_user: '',
                                  to_user_id: '',
                                  server_name: user_server.name,
                                  server_id: user_server._id,
                                  user: user.username,
                                  user_id: user._id,
                                  created: new Date(),
                                  last_updated: new Date()
                                }, function (err, id) {});
                            }
                        }
                    } catch (err) {
                        logger.error(err);
                    }
                }).run();
            });
        });
    }

    function _partChannelCallback (message, channel_name) {
        channel_nicks_manager.removeChannelNick(
            user_server.name, channel_name, client.nick);
        channel_listeners_manager.removeChannelClient(
            user_server.name, channel_name, client.nick, user.username);
        var listeners = client.listeners('message' + channel_name);
        _.each(listeners, function (listener) {
            client.removeListener('message' + channel_name, listener);
        })
        Fiber(function() {
            UserChannels.update(
                {name: channel_name, user_server_id: user_server._id},
                {$set: {status: 'user_disconnected'}});
        }).run();
        for (job in JOBS) {
            if (job.search(channel_name) >= 0)
                Meteor.clearInterval(JOBS[job]);
        }
    }

    function _partUserServerCallback (message, user_server, client) {
        Fiber(function () {
            UserServers.update(
                {_id: user_server._id},
                {$set: {status: 'user_disconnected'}}
            );
        }).run();
        Fiber(function () {
            UserChannels.update(
                {
                    user_server_id: user_server._id,
                    status: {$nin: ['user_disconnected', 'admin_disconnected']}
                },
                {$set: {status: 'disconnected'}},
                {multi: true}
            );
        }).run();
        Fiber(function () {
            UserChannels.find(
                {user_server_id: user_server._id}).forEach(function (channel) {
                    var key = user_server.name + '-' + channel.name;
                    if (WHO_DATA_POLL_LOCK[key] == user.username)
                        WHO_DATA_POLL_LOCK[key] = '';
                });
        }).run();
        for (job in JOBS) {
            Meteor.clearInterval(JOBS[job]);
            JOBS[job] = '';
        }
    }

    function _create_update_user_channel (user_server, channel_data) {
        UserChannels.update(
            {
                name: channel_data.name, user_server_id: user_server._id,
                user: user.username
            },
            {$set: {
                password: channel_data.password,
                user_id: user._id,
                user_server_name: user_server.name,
                last_updated: new Date(),
                last_updater: user.username,
                last_updater_id: user._id}
            },
            {upsert: true}
        );
        var user_channel = UserChannels.findOne(
            {
                name: channel_data.name, user_server_id: user_server._id,
                user: user.username
            }
        );
        return user_channel;
    }

    function _create_update_server_nick (info) {
        info['last_updated'] = new Date();
        info['server_name'] = user_server.name;
        info['server_id'] = user_server.server_id;
        // SmartCollections does not support 'upsert'
        //ServerNicks.upsert({
        //  server_name: user_server.name, nick: info.nick},
        //  {$set: info}
        //);
        Fiber(function () {
            var server_nick = ServerNicks.findOne(
                {server_name: user_server.name, nick: info.nick});
            if (server_nick) {
                for (key in info) {
                    if (info[key] == server_nick[key])
                        delete info[key];
                }
            }
            ServerNicks.update(
                {server_name: user_server.name, nick: info.nick},
                {$set: info},
                {upsert: true},
                function (err, updated) {}
            );
        }).run();
    }

    function _logIncomingMessage (message, log_options) {
        Fiber(function () {
            if (log_options.roomtype == 'channel') {
                var channel = UserChannels.findOne(
                    {
                        _id: log_options.room_id,
                        user_server_id: user_server._id
                    }, {_id: 1, name: 1});
                if (!channel)
                    return;
                channelLogsManager.insert({
                    message: message,
                    raw_message: {},
                    from: client.nick,
                    from_user: user.username,
                    from_user_id: user._id,
                    nick: client.nick,
                    channel_name: channel.name,
                    channel_id: channel._id,
                    server_name: user_server.name,
                    server_id: user_server._id,
                    user: user.username,
                    user_id: user._id,
                    created: new Date(),
                    last_updated: new Date()
                });
            } else if (log_options.roomtype == 'pm') {
                var to = log_options.room_id.substr(
                    log_options.room_id.indexOf('_') + 1);
                PMLogs.insert({
                  message: message,
                  raw_message: {},
                  from: client.nick,
                  display_from: client.nick,
                  from_user: user.username,
                  from_user_id: user._id,
                  to_nick: to,
                  to_user: '',
                  to_user_id: '',
                  server_name: user_server.name,
                  server_id: user_server._id,
                  user: user.username,
                  user_id: user._id,
                  created: new Date(),
                  last_updated: new Date()
                }, function (err, id) {});
            } else if (log_options.roomtype == 'server') {
                UserServerLogs.insert({
                    message: message,
                    raw_message: {},
                    from: client.nick,
                    from_user: null,
                    from_user_id: null,
                    server_name: user_server.name,
                    server_id: user_server._id,
                    user: user.username,
                    user_id: user._id,
                    created: new Date(),
                    last_updated: new Date()
                }, function (err, id) {});
            }
        }).run();
    }

    function disconnectConnectingServerOnTimeout (timeout) {
        Meteor.setTimeout(function () {
            Fiber(function () {
                UserServers.update(
                    {_id: user_server._id, status: 'connecting'},
                    {$set: {status: 'disconnected'}}
                );
            }).run();
        }, timeout);
        disconnectConnectingChannelsOnTimeout(timeout);
    }

    function _sendPMMessage(to, message, action, send) {
        try {
            if (message.search('/me') == 0)
                message = message.replace('/me', client.nick);
            PMLogs.insert({
              message: message,
              raw_message: {},
              from: client.nick,
              display_from: action? '': client.nick,
              from_user: user.username,
              from_user_id: user._id,
              to_nick: to,
              to_user: '',
              to_user_id: '',
              server_name: user_server.name,
              server_id: user_server._id,
              user: user.username,
              user_id: user._id,
              created: new Date(),
              last_updated: new Date()
            }, function (err, id) {});
            if (send)
                client.say(to, message);
        } catch (err) {
            logger.error(err);
        }
    }

    return {
        joinChannel: function (channel_name, password) {
            try {
                _addChannelNamesListener(channel_name);
                _addChannelJoinListener(channel_name);
                _addChannelPartListener(channel_name);
                if (password) {
                    client.send('JOIN', channel_name, password);
                } else {
                    client.join(channel_name, function (message) {
                        Fiber(function () {
                            var channel = _create_update_user_channel(
                                user_server, {
                                    name: channel_name, password: password});
                            _joinChannelCallback(message, channel);
                        }).run();
                    });
                }
            } catch (err) {
                logger.error(err);
            }
            disconnectConnectingChannelsOnTimeout(20000, [channel_name]);
        },
        partChannel: function (channel_name) {
            try {
                var client = client_data[user_server.name];
                client.part(channel_name, function (message) {
                    _partChannelCallback(
                        message, channel_name);
                });
            } catch (err) {
                logger.error(err);
            }
        },
        create_update_user_channel: function (channel_data) {
            try {
                Fiber(function () {
                    _create_update_user_channel(user_server, channel_data);
                }).run();
            } catch (err) {
                logger.error(err);
            }
        },
        removeChannel: function (channel) {},
        joinUserServer: function () {
            SERVER_JOIN_QUEUE.add(function (done) {
                console.log('=======JOINING SERVER========', user_server.name, user.username);
                var timeoutId = Meteor.setTimeout(function () {
                        done();
                    }, 90000);
                Fiber(function () {
                    try {
                        fs.writeFileSync(CONFIG.IDENT_FILE_PATH, 'global { reply "' + user.username + '" }');
                    } catch (err) {
                        console.log(err);
                    }
                    try {
                        var server = Servers.findOne({name: user_server.name});
                        var server_url = server.connections[0].url;
                        var server_port = server.connections[0].port || '6667';
                        var nick = user_server.nick;
                        var client_options = {
                            autoConnect: false,
                            port: ssl_credentials? '6697': server_port,
                            userName: nick,
                            realName: user_server.real_name || '~',
                            secure: ssl_credentials,
                            selfSigned: true,
                            certExpired: true,
                            debug: CONFIG.DEBUG
                        };
                        client = new irc.Client(server_url, nick, client_options);
                        client_data[server.name] = client;
                        UserServers.update(
                            {_id: user_server._id, status: {$nin: ['user_disconnected', 'admin_disconnected']}},
                            {
                                $set: {status: 'connecting', active: true}
                            },
                            {multi: true}
                        );
                        UserChannels.update(
                            {
                                user_server_name: user_server.name,
                                user: user.username,
                                status: {$nin: ['user_disconnected', 'admin_disconnected']}
                            },
                            {$set: {status: 'connecting'}},
                            {multi: true}
                        );
                        if (LISTENERS.server['nickSet'] != undefined)
                            return;
                        LISTENERS.server['nickSet'] = '';
                        client.addListener('nickSet', function (nick) {
                            Fiber(function () {
                                if (user_server.current_nick != nick) {
                                    ChannelNicks.remove(
                                        {
                                            server_name: user_server.name,
                                            nick: user_server.current_nick
                                        }, function (err) {}
                                    );
                                    UserServers.update({_id: user_server._id}, {$set: {current_nick: nick}});
                                    user_server = UserServers.findOne({_id: user_server._id});
                                    UserChannels.find(
                                        {
                                            user_server_name: user_server.name,
                                            user: user.username
                                        }).forEach(function (channel) {
                                            channel_nicks_manager.addChannelNick(
                                                user_server.name, channel.name,
                                                nick);
                                        });
                                }
                            }).run();
                        });
                        client.connect(function (message) {
                            Fiber(function () {
                                _joinServerCallback(message);
                                done();
                                console.log(
                                    '========JOINED SERVER=========',
                                    user_server.name, user.username);
                                Meteor.clearTimeout(timeoutId);
                            }).run();
                        });
                        disconnectConnectingServerOnTimeout(30000);
                    } catch (err) {
                        logger.error(err);
                        done();
                        Meteor.clearTimeout(timeoutId);
                    }
                }).run();
            });
        },
        partUserServer: function () {
            try {
                var client = client_data[user_server.name];
                client.disconnect(
                    CONFIG['SERVER_QUIT_MESSAGE'] || '', function (message) {
                    _partUserServerCallback(message, user_server, client);
                });
            } catch (err) {

            }
        },
        addUserServer: function (server_data) {
            try {
                var now = new Date();
                var user_server_id = UserServers.insert({
                    name: server_data.server.name,
                    server_id: server_data.server._id,
                    nick: server_data.nick,
                    password: server_data.password,
                    user: user,
                    user_id: user._id,
                    created: now,
                    creator: user,
                    creator_id: user._id,
                    last_updated: now,
                    last_updater: user,
                    last_updater_id: user._id,
                });
                var user_server = UserServers.findOne({_id: user_server_id});
                _.each(server_data.channels, function (item) {
                    create_update_user_channel(user_server, item);
                });
            } catch (err) {
                logger.error(err);
            }
        },
        markAway: function (message) {
            try {
                Fiber(function () {
                    UserServers.update({_id: user_server._id}, {$set: {away_msg: message}});
                    client.send('AWAY', message);
                }).run();
            } catch (err) {
                logger.error(err);
            }
        },
        markActive: function () {
            try {
                client.send('AWAY', '');
            } catch (err) {
                logger.error(err);
            }
        },
        removeServer: function (server_id, user_id) {},
        updateServer: function (server_id, server_data, user_id) {},
        sendChannelMessage: function (channel_name, message, action, send, log) {
            try {
                var channel = UserChannels.findOne({
                  name: channel_name,
                  user_server_id: user_server._id,
                }) || {};
                if (message.search('/me') == 0)
                    message = message.replace('/me', client.nick);
                if (log)
                    channelLogsManager.insert({
                        message: message,
                        raw_message: {},
                        from: action? '': client.nick,
                        from_user: user.username,
                        from_user_id: user._id,
                        nick: client.nick,
                        channel_name: channel.name,
                        channel_id: channel._id,
                        server_name: user_server.name,
                        server_id: user_server._id,
                        user: user.username,
                        user_id: user._id,
                        created: new Date(),
                        last_updated: new Date()
                    });
                if (send)
                    client.say(channel_name, message);
            } catch (err) {
                logger.error(err);
            }
        },
        changeNick: function (nick) {
            try {
                client.send('NICK', nick);
            } catch (err) {
                logger.error(err);
            }
        },
        sendServerMessage: function (message) {
            try {
                UserServerLogs.insert({
                    message: message,
                    raw_message: message,
                    from: client.nick,
                    from_user: user.username,
                    from_user_id: user.user_id,
                    server_name: user_server.name,
                    server_id: user_server._id,
                    user: user.username,
                    user_id: user._id,
                    created: new Date(),
                    last_updated: new Date()
                });
            } catch (err) {
                logger.error(err);
            }
        },
        sendPMMessage: function (to, message, action, send) {
            _sendPMMessage(to, message, action, send);
        },
        getServerClient: function (server_id, user_id) {},
        isServerConnected: function (server_id) {},
        sendRawMessage: function (message, log_options) {
            //try {
                var args = message.substr(1).split(' ');
                if (log_options && (args[0] == 'whois' || args[0] == 'WHOIS')) {
                    client.whois(args[1], function (info) {
                        /*
                        if (log_options.logInput) {
                            _logIncomingMessage(message, log_options);
                        }
                        */
                        _whois_callback(info, log_options);
                    });
                } else if (args[0] == 'me') {
                    client.action(
                        log_options.target, args.slice(1).join(" "));
                } else if (args[0].toLowerCase() == 'msg') {
                    if (args[1].toLowerCase() == 'nickserv') {
                        client.say('NickServ', args.slice(2).join(' '));
                    } else {
                        var userpms = UserPms.findOne(
                            {user_id: user._id}) || {pms: {}};
                        userpms.pms[args[1]] = "";
                        UserPms.upsert(
                            {user_id: user._id,
                             user_server_id: user_server._id,
                             user_server_name: user_server.name,
                             user: user.username},
                             {$set: {pms: userpms.pms}});
                        _sendPMMessage(args[1], args.slice(2).join(' '));
                    }
                } else
                    client.send.apply(client, args);
            //} catch (err) {
            //    logger.error(err);
            //}
        }
    }
    
};
