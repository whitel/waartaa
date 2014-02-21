Handlebars.registerHelper('channel_to_edit', function (e) {
  var channel = UserChannels.findOne({_id: Session.get('channel_id_to_edit')});
  if (channel) {
    channel.password = channel.password || '';
    return channel;
  }
});

Template.server_channels.channels = function (server_id) {
  return UserChannels.find(
    {user_server_id: server_id, active: true},
    {
      fields: {last_updated: 0},
      sort: {name: 1}
    });
}

function serverChannelsRenderedCallback () {
  $('#chat-servers .nano').nanoScroller();
  updateHeight();
}

Template.server_channels.rendered = serverChannelsRenderedCallback;

Template.server_channel_item.rendered = function () {
  Session.set("lastAccessedChannel-" + this.data._id, new Date());
};

Template.server_channel_item.helpers({
  isChannelActive: function () {
    var room = Session.get('room') || {};
    if (room.roomtype == 'channel' && room.server_id == this.user_server_id &&
        room.room_id == this._id)
      return true;
  }
});

Template.channel_menu.events = {
  'click .channel-remove': function (e) {
    var channel_id = $(e.target).data("channel-id");
    var channel = UserChannels.findOne({_id: channel_id});
    Meteor.call(
      "part_user_channel", channel.user_server_name, channel.name, true);
  },
  'click .editServerChannelLink': function (e) {
    e.preventDefault();
    e.stopPropagation();
    var $this = $(e.target);
    var channel_id = $this.data('channel-id');
    Session.set('channel_id_to_edit', channel_id);
    var $modal_content = $('#editServerChannel-' + channel_id);
    Meteor.setTimeout(function () {
      $modal_content.modal().on(
        'shown.bs.modal', function (e) {
          $modal_content.find('[name="password"]').focus();
        })
        .on('hidden.bs.modal', function (e) {
          $('#chat-input').focus();
        })
      ;
    }, 4);
  },
  'click .toggleJoinChannel': function (e) {
    e.preventDefault();
    e.stopPropagation();
    var $this = $(e.target);
    var channel_id = $this.data('channel-id');
    var channel = UserChannels.findOne({_id: channel_id});
    var status = $this.data('status');
    if (status == 'connected')
      Meteor.call(
        "part_user_channel", channel.user_server_name, channel.name, false);
    else
      Meteor.call('join_user_channel', channel.user_server_name, channel.name);
  }
};

Template.edit_server_channel.events = {
  'submit .editServerChannel': function (e) {
    e.preventDefault();
    e.stopPropagation();
    var $form = $(e.target);
    var data = {'password': $form.find('[name="password"]').val() || ''};
    Meteor.call('edit_user_channel', $form.data('channel-id'), data, function (err) {
      $form.parents('.modal').modal('hide');
    })
  }
};

Template.server_channels.rendered = function(){
  if(UserServers.find().count() > 0 && Session.get('room') === undefined) {
    // names of channels of the first server that is connected
    var server_channels = UserServers.findOne().channels.sort();
    // looping to find the first connected channel obtained from
    // UserServers.channel
    for (var i = 0; i < server_channels.length ; i++) {
      // to find if the channel is actually connected
      if(UserChannels.findOne({name:server_channels[i]}) !== undefined) {
        var channel = UserChannels.findOne({name: server_channels[i]});
        // Joining chat room
        waartaa.chat.helpers.setCurrentRoom({
           roomtype: 'channel',
           server_id: channel.user_server_id,
           channel_id: channel._id,
           channel_name: channel.name,
           server_name: channel.user_server_name
         });

        // breaking off after we have connected to the first channel
        break;
      }
    }
  }
  // HTML id of the channel on channels list
  var channel_id = '#channelLink-' + Session.get('room').room_id;
  // Activate channel link
  $(channel_id).parent().addClass('active');
};