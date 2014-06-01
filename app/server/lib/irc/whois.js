
    function _getLogsFromWhoisInfo(info) {
        if (!info)
            return;
        var logs = [];
        logs.push(
            info.nick + ' has userhost ' + info.user + '@' + info.host
            + ' and realname ' + info.realname);
        if (info.channels)
            logs.push(info.nick + ' is on ' + info.channels.join(', '));
        if (info.serverInfo)
            logs.push(
                info.nick + ' is connected on ' + info.server + ' (' +
                info.serverInfo + ')');
        if (info.account)
            logs.push(info.nick + ' ' + info.accountInfo + ' ' + info.account);
        return logs;
    }


    function _saveWhoisResponseAsChatLog(info, log_options) {
        Fiber(function () {
            if (!log_options)
                return;
            var whoisLogs = _getLogsFromWhoisInfo(info);
            if (log_options.roomtype == 'channel') {
                var channel = UserChannels.findOne({
                    _id: log_options.room_id, user_server_id: user_server._id});
                if (!channel)
                    return;
                _.each(whoisLogs, function (text) {
                    channelLogsManager.insert({
                        message: text,
                        raw_message: info,
                        from: "WHOIS",
                        from_user: null,
                        from_user_id: null,
                        channel_name: channel.name,
                        channel_id: channel._id,
                        server_name: user_server.name,
                        server_id: user_server._id,
                        user: user.username,
                        user_id: user._id,
                        created: new Date(),
                        last_updated: new Date(),
                        type: 'CMDRESP'
                    });
                });
            } else if (log_options.roomtype == 'pm') {
                var to = log_options.room_id.substr(
                    log_options.room_id.indexOf('_') + 1);
                _.each(whoisLogs, function (text) {
                    PMLogs.insert({
                      message: text,
                      raw_message: {},
                      from: to,
                      display_from: 'WHOIS',
                      from_user: null,
                      from_user_id: null,
                      to_nick: client.nick,
                      to_user: user.username,
                      to_user_id: user._id,
                      server_name: user_server.name,
                      server_id: user_server._id,
                      user: user.username,
                      user_id: user._id,
                      created: new Date(),
                      last_updated: new Date()
                    }, function (err, id) {});
                });
            } else if (log_options.roomtype == 'server') {
                _.each(whoisLogs, function (text) {
                    UserServerLogs.insert({
                        message: text,
                        raw_message: {},
                        from: 'WHOIS',
                        from_user: null,
                        from_user_id: null,
                        server_name: user_server.name,
                        server_id: user_server._id,
                        user: user.username,
                        user_id: user._id,
                        created: new Date(),
                        last_updated: new Date()
                    }, function (err, id) {});
                });
            }
        }).run();
    }

    

    function _whois_callback (info, log_options) {
        _create_update_server_nick(info);
        _saveWhoisResponseAsChatLog(info, log_options);
    }