ChannelLogs.allow({
  insert: function (userId, log) {
    log.status = 'sent';
    var user = Meteor.users.findOne({_id: userId});
    var log_options = {log: false};
    if (log.message.search('/whois') == 0) {
        log_options.room_id = log.channel_id;
        log_options.roomtype = 'channel';
    }
    _send_channel_message(
    user, log.channel_id, log.message, log_options);
    if (log.message.substr(0, 3) == '/me') {
        log.message = log.message.replace('/me', log.from);
        log.from = null;
    } else if (log.message[0] == '/')
        return false;
    return true;
  }
});


/**
 * Validations and actions for insert, update, remove operations on
 * UserChannels collection from client side.
 */
UserChannels.allow({
  insert: function (userId, doc) {
    return UserChannelManager().createOrUpdate(userId, doc);
  },
  update: function (userId, doc, fieldNames, modifer) {
    return UserChannelManager().createOrUpdate(
      userId, doc, fieldNames, modifer);
  },
  remove: function (userId, doc) {
    return UserChannelManager().deactivate(userId, doc);
  }
});


/**
 * Validations and actions for insert, update and remove operations on
 * UserServers collection from client side.
 */
UserServers.allow({
  insert: function (userId, doc) {
    return UserServerManager().createOrUpdate(userId, doc);
  },
  update: function (userId, doc, fieldNames, modifer) {
    return UserServerManager().createOrUpdate(
      userId, doc, fieldNames, modifer);
  },
  remove: function (userId, doc) {
    return UserServerManager().deactivate(userId, doc);
  }
});
