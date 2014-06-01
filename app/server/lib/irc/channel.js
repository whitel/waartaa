var ChannelManager = (function () {
})();

function () {
  
};

ChannelManager = function (serverName, user) {
    var client = getServerClient(serverName, user);

    function _updateChannelNicks (channel_name, nicks) {
        var nicks_list = [];
        for (nick in nicks) {
            nicks_list.push(nick);
        }
        enqueueTask(DELAYED_QUEUE, function () {
            Fiber(function () {
                ChannelNicks.remove(
                    {
                        channel_name: channel_name, server_name: user_server.name,
                        nick: {$nin: nicks_list}
                    }
                );
            }).run();
        });
        _.each(nicks_list, function (nick) {
            channel_nicks_manager.addChannelNick(
                user_server.name, channel_name, nick);
        });
        /*
        try {
            var db_nicks_count = ChannelNicks.find(
                {channel_name: channel_name, server_name: user_server.name}
            ).count();
            var irc_nicks_count = nicks_list.length;
            assert(db_nicks_count == irc_nicks_count);
        } catch (err) {
            console.log(err);
            if (err)
                logger.error(
                    'ChannelNicksUpdateError for ' + user_server.name +
                        channel_name,
                    {
                        'nicks_list': nicks_list,
                        'irc_nicks_count': irc_nicks_count,
                        'db_nicks_count': db_nicks_count,
                        'nicks_nin': ChannelNicks.find({
                            channel_name: channel_name, server_name: user_server.name,
                            nick: { $nin: nicks_list }
                        }, {'nick': 1}).fetch(),
                        'error': err
                    }
                );
        }*/
    }

    function _addChannelNamesListener (channel_name) {
        if (LISTENERS.channel['names' + channel_name] != undefined)
            return;
        LISTENERS.channel['names' + channel_name] = '';
        client.addListener('names' + channel_name, function (nicks) {
            if (!GLOBAL_LISTENERS['channelNamesListener-' + user_server + channel_name]) {
                GLOBAL_LISTENERS['channelNamesListener-' + user_server + channel_name] = true;
                _updateChannelNicks(channel_name, nicks);
            }
        });
    }

    function _joinChannelCallback (message, channel) {
        channel_nicks_manager.addChannelNick(
            user_server.name, channel.name, client.nick);
        channel_listeners_manager.addChannelClient(
            user_server.name, channel.name, client.nick, user.username);
        if (channel.status == 'connected')
            return;
        Fiber(function () {
            UserChannels.update(
                {_id: channel._id}, {$set: {status: 'connected'}});
        }).run();
        if (LISTENERS.channel['message' + channel.name] != undefined)
            return;
        LISTENERS.channel['message', channel.name] = '';
        // Remove channel message listeners if any
        var listeners = client.listeners('message' + channel.name);
        _.each(listeners, function (listener) {
            client.removeListener('message' + channel.name, listener);
        });
        client.addListener('message' + channel.name, function (
                nick, text, message) {
            enqueueTask(URGENT_QUEUE, function () {
                Fiber(function () {
                    var global = false;
                    if (message.type != 'NOTICE')
                        global = true;
                    channelLogsManager.insertIfNeeded({
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
                        global: global,
                        not_for_user: null,
                        created: new Date(),
                        last_updated: new Date()
                    }, client.nick);
                }).run();
            });
            enqueueTask(DELAYED_QUEUE, function () {
                Fiber(function () {
                    if (_.isUndefined(Meteor.presences.findOne({userId: user._id}))) {
                        if (messageContainsNick(text, user_server.current_nick)
                                && nick) {
                            waartaa.notifications.notify_channel_mention(
                                user, channel, nick, text);
                        }
                    }
                }).run();
            });
        });
    }
    /* Callbacks */
    function getOrCreateUserChannel(channel_data) {
        var channel = UserChannels.findOne({
            user_server_id: user_server._id, name: channel_data.name,
            user: user.username
        });
        if (!channel) {
            var user_channel_id = UserChannels.insert({
                name: channel_data.name,
                user_server_id: user_server._id,
                user_server_name: user_server.name,
                user: user.username,
                user_id: user._id,
                creator: user.username,
                creator_id: user._id,
                created: new Date(),
                last_updater: user.username,
                last_updater_id: user._id,
                last_updated: new Date(),
                active: true
            });
            var channel = UserChannels.findOne({_id: user_channel_id});
        }
        return channel;
    }

    function _addGlobalChannelNamesListener () {
        if (LISTENERS.server['names'] != undefined)
            return;
        LISTENERS.server['names'] = '';
        client.addListener('names', function (channel, nicks) {
                //console.log("++++++++++++++GLOBAL CHANNEL NAMES LISTENERS: " + channel + ' ' + user.username + ' ' + user_server.name);
                //console.log(nicks);
            Fiber(function () {
                //console.log(nicks);
                var user_channel = UserChannels.findOne({
                    name: channel, active: true, user: user.username});
                if (user_channel) {
                    _updateChannelNicks(user_channel.name, nicks);
                }
            }).run();
        });
    }

    function whoToWhoisInfo (nick, who_info) {
      var whoisInfo = {
        nick: nick,
        user: who_info.user,
        server: who_info.server,
        realname: who_info.gecos,
        host: who_info.host,
      }
      if (who_info.nick_status.search('G') >= 0)
        whoisInfo['away'] = true;
      else
        whoisInfo['away'] = false;
      return whoisInfo;
    }

    function _update_channel_nicks_from_who_data (message) {
      _updateChannelNicks(message.channel, message.nicks);
    }

    function _addWhoListener () {
      if (LISTENERS.server['who'] != undefined)
        return;
      LISTENERS.server['who'] = '';
      client.addListener('who', function (message) {
        try {
            if (!message)
                return;
            var key = user_server.name + '-' + message.channel;
            if (WHO_DATA_POLL_LOCK[key] == user.username)
                WHO_DATA_POLL_LOCK[key] = "";
            if (message) {
              for (nick in message.nicks) {
                var who_info = message.nicks[nick];
                var whoisInfo = whoToWhoisInfo(nick, who_info);
                _create_update_server_nick(whoisInfo);
              }
              _updateChannelNicks(message.channel, message.nicks);
            }
        } catch (err) {
            logger.error(err);
        }
      });
    }

    function _getChannelWHOData (channel_name) {
        var key = user_server.name + '-' + channel_name;
        if (!WHO_DATA_POLL_LOCK[key] || WHO_DATA_POLL_LOCK[key] == user.username) {
            WHO_DATA_POLL_LOCK[key] = user.username;
            client.send('who', channel_name);
        }
    }

    function _addChannelJoinListener (channel_name) {

    }

    function _addGlobalChannelJoinListener () {
        if (LISTENERS.server['join'] != undefined)
            return;
        LISTENERS.server['join'] = '';
        // remove any pre existing 'join' listener
        var listeners = client.listeners('join');
        _.each(listeners, function (listener) {
            client.removeListener('join', listener);
        });
        client.addListener('join', function (channel, nick, message) {
            enqueueTask(URGENT_QUEUE, function () {
                Fiber(function () {
                    channel_nicks_manager.addChannelNick(
                        user_server.name, channel, nick);
                    var user_channel = _create_update_user_channel(
                        user_server, {name: channel});
                    if (nick == client.nick) {
                        /*
                        var job_key = 'WHO-' + channel;
                        if (JOBS[job_key])
                            clearInterval(JOBS[job_key]);
                        JOBS[job_key] = setInterval(
                            _getChannelWHOData, CONFIG.channel_who_poll_interval,
                            channel);
                        */
                        console.log(user_channel);
                        UserChannels.update(
                            {_id: user_channel._id}, {$set: {active: true}},
                            {multi: true}, function (err, updated) {});
                        _addChannelJoinListener(user_channel.name);
                        _addChannelPartListener(user_channel.name);
                        _joinChannelCallback(message, user_channel);
                    }
                    var channel_join_message = nick + ' has joined the channel.';
                    //if (nick == client.nick)
                    //    channel_join_message = 'You have joined the channel.';
                    channelLogsManager.insertIfNeeded({
                        message: channel_join_message,
                        raw_message: message,
                        from: null,
                        from_user: null,
                        from_user_id: null,
                        channel_name: user_channel.name,
                        channel_id: user_channel._id,
                        server_name: user_server.name,
                        server_id: user_server._id,
                        user: user.username,
                        user_id: user._id,
                        nick: nick,
                        created: new Date(),
                        last_updated: new Date(),
                        type: 'ChannelJoin',
                        global: true
                    }, client.nick);
                }).run();
            });
        });
    }

    function _addChannelPartListener (channel_name) {
        if (LISTENERS.channel['part' + channel_name] != undefined)
            return;
        LISTENERS.channel['part' + channel_name] = '';
        client.addListener('part' + channel_name, function (nick, reason, message) {
            enqueueTask(URGENT_QUEUE, function () {
                Fiber(function () {
                    channel_nicks_manager.removeChannelNick(
                        user_server.name, channel_name, nick);
                    var channel = UserChannels.findOne(
                        {user_server_id: user_server._id, name: channel_name});
                    if (!channel)
                        return;
                    var part_message = "";
                    //if (nick == client.nick)
                    //    part_message = 'You have left';
                    //else
                    part_message = nick + ' has left';
                    if (reason)
                        part_message += ' (' + reason + ')';
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
                        type: 'ChannelPart',
                        global: true
                    }, client.nick);
                    if (channels_listening_to[channel_name])
                        delete channels_listening_to[channel_name];
                }).run();
            });
        });
    }

    function disconnectConnectingChannelsOnTimeout (timeout, channel_names) {
        Meteor.setTimeout(function () {
            Fiber(function () {
                var query = {user_server_id: user_server._id, status: 'connecting'};
                if (channel_names)
                    query['name'] = {$in: channel_names};
                UserChannels.update(
                    query,
                    {$set: {status: 'disconnected'}},
                    {multi: true}
                );
            }).run();
        }, timeout);
    }

    return {
        join: function (channel_name) {

        },
        part: function (channel_name) {

        },
        quit: function (channel_name) {

        },
        init: 
    }
};

ChannelNicksManager = function () {
    var _CHANNEL_NICKS_RECENTLY_JOINED = {};
    var _CHANNEL_NICKS_RECENTLY_PARTED = {};
    var _MAX_LENGTH = 10;

    function _initializeChannelNicksDataIfAbsent (server_name, channel_name) {
        var key = server_name + channel_name;
        if (_CHANNEL_NICKS_RECENTLY_JOINED[key] === undefined)
            _CHANNEL_NICKS_RECENTLY_JOINED[key] = Map();
        if (_CHANNEL_NICKS_RECENTLY_PARTED[key] === undefined)
            _CHANNEL_NICKS_RECENTLY_PARTED[key] = Map();
    }

    return {
        addChannelNick: function (server_name, channel_name, nick) {
            _initializeChannelNicksDataIfAbsent(server_name, channel_name);
            var key = server_name + channel_name;
            if (_CHANNEL_NICKS_RECENTLY_JOINED[key].get(nick) === undefined) {
                _CHANNEL_NICKS_RECENTLY_JOINED[key].set(nick, '');
                _CHANNEL_NICKS_RECENTLY_PARTED[key].delete(nick);
                if (_CHANNEL_NICKS_RECENTLY_JOINED[key].length > _MAX_LENGTH) {
                    _CHANNEL_NICKS_RECENTLY_JOINED[key].delete(
                        _CHANNEL_NICKS_RECENTLY_JOINED[key].keys()[0]);
                }
                enqueueTask(DELAYED_QUEUE, function () {
                    Fiber(function () {
                        ChannelNicks.update(
                          {
                            channel_name: channel_name,
                            server_name: server_name,
                            nick: nick
                          },
                          {$set: {}},
                          {upsert: true},
                          function (err) {}
                        );
                    }).run();
                });
            }
        },
        removeChannelNick: function (server_name, channel_name, nick) {
            _initializeChannelNicksDataIfAbsent(server_name, channel_name);
            var key = server_name + channel_name;
            if (_CHANNEL_NICKS_RECENTLY_PARTED[key].get(nick) === undefined) {
                _CHANNEL_NICKS_RECENTLY_PARTED[key].set(nick, '');
                _CHANNEL_NICKS_RECENTLY_JOINED[key].delete(nick);
                if (_CHANNEL_NICKS_RECENTLY_PARTED[key].length > _MAX_LENGTH) {
                    _CHANNEL_NICKS_RECENTLY_PARTED[key].delete(
                        _CHANNEL_NICKS_RECENTLY_PARTED[key].keys()[0]);
                }
                enqueueTask(DELAYED_QUEUE, function () {
                    Fiber(function () {
                        ChannelNicks.remove(
                          {
                            channel_name: channel_name,
                            server_name: server_name,
                            nick: nick
                          },
                          function (err) {}
                        );
                    }).run();
                });
            }
        }
    }
};


ChannelListenersManager = function () {
    var _CHANNEL_CLIENTS = {};
    var _CHANNEL_LISTENERS = {};
    var _MAX_LISTENERS_PER_CHANNEL = 4;

    function _updateChannelListeners (server_name, channel_name) {
        var key = server_name + channel_name;
        var channel_clients = _CHANNEL_CLIENTS[key] || {};
        if (_CHANNEL_LISTENERS[key] === undefined)
            _CHANNEL_LISTENERS[key] = {};
        var channel_listeners = _CHANNEL_LISTENERS[key] || {};

        console.log("=====BEFORE======");
        console.log(_CHANNEL_CLIENTS, _CHANNEL_LISTENERS);
        for (nick in channel_listeners) {
            if (channel_clients[nick] === undefined) {
                delete channel_listeners[nick];
            }
        }
        var listeners_count = Object.keys(channel_clients).length;
        for (nick in channel_clients) {
            if (listeners_count < _MAX_LISTENERS_PER_CHANNEL) {
                if (channel_listeners[nick] === undefined) {
                    channel_listeners[nick] = channel_clients[nick];
                    listeners_count++;
                }
            } else
                break;
        }
        console.log("=====AFTER======");
        console.log(_CHANNEL_CLIENTS, _CHANNEL_LISTENERS);

    }

    return {
        addChannelClient: function (server_name, channel_name, nick, username) {
            var key = server_name + channel_name;
            if (_CHANNEL_CLIENTS[key] === undefined)
                _CHANNEL_CLIENTS[key] = {};
            if (_CHANNEL_CLIENTS[key][nick] === undefined) {
                _CHANNEL_CLIENTS[key][nick] = username;
                _updateChannelListeners(server_name, channel_name);
                return true;
            }
            return false;
        },
        removeChannelClient: function (server_name, channel_name, nick, username) {
            var key = server_name + channel_name;
            if (_CHANNEL_CLIENTS[key] === undefined)
                _CHANNEL_CLIENTS[key] = {};
            if (_CHANNEL_CLIENTS[key][nick] !== undefined) {
                delete _CHANNEL_CLIENTS[key][nick];
                _updateChannelListeners(server_name, channel_name);
                return true;
            }
            return false;
        },
        removeNickFromChannels: function (server_name, channel_names, nick) {
            _.each(channel_names, function (channel_name) {
                var key = server_name + channel_name;
                if (_CHANNEL_CLIENTS[key] === undefined)
                    _CHANNEL_CLIENTS[key] = {};
                if (_CHANNEL_CLIENTS[key][nick] !== undefined) {
                    delete _CHANNEL_CLIENTS[key][nick];
                    _updateChannelListeners(server_name, channel_name);
                }
            });
        },
        isClientListener: function (server_name, channel_name, nick) {
            var key = server_name + channel_name;
            if ((_CHANNEL_LISTENERS[key] || {})[nick] === undefined) {
                console.log('========NICK NOT LISTENER========');
                console.log(server_name, channel_name, nick);
                console.log(_CHANNEL_LISTENERS);
                return false;
            }
            console.log('========NICK IS LISTENER========');
            console.log(server_name, channel_name, nick);
            console.log(_CHANNEL_LISTENERS);
            return true;
        }

    };
};

function shallWriteChannelLog (nick, text, channel_name, server_name, client_nick) {
    console.log('++++++++++++++++++++++++++++++++');
    console.log(RECENT_CHANNEL_LOGS);
    if (RECENT_CHANNEL_LOGS[server_name] === undefined)
        RECENT_CHANNEL_LOGS[server_name] = {};
    if (RECENT_CHANNEL_LOGS[server_name][channel_name] === undefined)
        RECENT_CHANNEL_LOGS[server_name][channel_name] = new CappedArray(10);
    var recent_channel_logs = RECENT_CHANNEL_LOGS[server_name][channel_name];
    var latest_message = recent_channel_logs[recent_channel_logs.length - 1];
    var second_latest_message = recent_channel_logs[recent_channel_logs.length - 2];
    var current_message = {
        nick: nick, text: text, client_nick: client_nick
    };
    console.log('current_message', current_message);
    console.log('latest_message', latest_message);
    console.log('second_latest_message', second_latest_message);
    var shall_wrtite = false;
    if (latest_message) {
        if (latest_message.client_nick == current_message.client_nick)
            shall_wrtite = true;
        else if (latest_message.nick != current_message.nick ||
                latest_message.text != current_message.text) {
            console.log('second_latest_message', second_latest_message);
            if (second_latest_message) {
                if (second_latest_message.text != current_message.text) {
                    shall_wrtite = true;
                }
            } else {
                shall_wrtite = true;
            }
        }
    } else {
        shall_wrtite = true;
    }
    console.log('shall_wrtite', shall_wrtite);
    if (shall_wrtite) {
        console.log('recent_channel_logs', recent_channel_logs);
        recent_channel_logs.push(current_message);
        console.log('recent_channel_logs', recent_channel_logs);
        console.log(RECENT_CHANNEL_LOGS[server_name][channel_name]);
        console.log('recent_channel_logs', recent_channel_logs);
    }
    return shall_wrtite;
}

ChannelLogsManager = function () {
    function _insert (log) {
        ChannelLogs.insert(log, function (err, id) {});
        OldChannelLogs.insert(log, function (err, id) {});
    }
    return {
        insertIfNeeded: function (log, client_nick) {
            var server_name = log.server_name;
            var channel_name = log.channel_name;
            var nick = log.nick;
            if (channel_listeners_manager.isClientListener(
                    server_name, channel_name, client_nick)) {
                if (typeof(CHANNEL_LOGS_WRITE_LOCKS[server_name])
                        == 'undefined')
                    CHANNEL_LOGS_WRITE_LOCKS[server_name] = {};
                if (typeof(CHANNEL_LOGS_WRITE_LOCKS[server_name][
                        channel_name]) == 'undefined')
                    CHANNEL_LOGS_WRITE_LOCKS[server_name][
                        channel_name] = new locks.createReadWriteLock();
                var rwlock = CHANNEL_LOGS_WRITE_LOCKS[server_name][
                    channel_name];
                rwlock.timedWriteLock(5000, function (error) {
                    Fiber(function () {
                        if (error) {
                            console.log(
                                'Could not get the lock within 5 seconds, ' +
                                'so gave up');
                        } else {
                            console.log('Acquired write lock', server_name,
                                        channel_name);
                            var shall_write = shallWriteChannelLog(
                                nick, log.message, channel_name, server_name,
                                client_nick);
                            rwlock.unlock();
                            log.not_for_user = (UserServers.findOne(
                                {name: server_name, current_nick: nick}) || {}
                            ).user || null;
                            if (shall_write)
                                _insert(log);
                        }
                    }).run();
                });
            } else if (global == false) {
                _insert(log);
            }
        },
        insert: function (log) {
            _insert(log);
        },
        cleanup: function () {
          /* Cleanup logs from the main ChannelLogs collection */
          Fiber(function () {
            processedChannels = {};
            UserChannels.find().forEach(function (channel) {
              var channelIdentifier = channel.user_server_name + channel.name;
              if (processedChannels[channelIdentifier] != undefined)
                return;
              var extraLogsCount = ChannelLogs.find(
                {
                  channel_name: channel.name,
                  server_name: channel.user_server_name
                }).count() - CONFIG.CHANNEL_LOGS_COLLECTION_LIMIT_PER_CHANNEL || 0;
              if (extraLogsCount <= 0)
                return;
              var thresholdLogTimestamp = (ChannelLogs.findOne({
                channel_name: channel.name,
                server_name: channel.user_server_name
              }, {sort: {created: 1}, skip: extraLogsCount}) || {}).created;
              if (thresholdLogTimestamp)
                ChannelLogs.remove({
                  channel_name: channel.name,
                  server_name: channel.user_server_name,
                  created: {$lte: thresholdLogTimestamp}
                });
            });
          }).run();
        }
    };
};