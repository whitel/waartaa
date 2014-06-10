VideoChat = (function () {

  var options = {};

  var connectSuccessCB = function (id) {
    Session.set('selfEasyrtcId', id);
    Session.set('easyrtcStatus', 'connected');
  };

  var connectErrorCB = function () {
    Session.set('selfEasyrtcId', '');
    Session.set('easyrtcStatus', 'disconnected');
  };

  var disconnectListener = function () {
    Session.set('selfEasyrtcId', '');
    Session.set('easyrtcStatus', 'connecting');
  };

  var roomListener = function (roomName, listeners) {
    var data = [];
    var exists = {};
    for (var listener in listeners) {
      var name = easyrtc.idToName(listener);
      if (Meteor.user().username != name && !exists.name) {
        data.push({
          id: listener,
          name: name
        });
        exists.name = name;
      }
    }
    Session.set('videoUsersList', data);
  };

  var acceptedCB = function (accepted, easyrtcId) {
    if (accepted) {
      Session.set('otherEasyrtcId', easyrtcId);
    } else {
      var username = easyrtc.idToName(easyrtcId);
      $('.errMsg').text('Your call was rejected by ' + username);
      $('.errMsg').show().delay(5000).fadeOut();
    }
    Session.set('videoCallingId');
  };

  var successCB = function () {
  };

  var errorCB = function () {
    Session.set('videoCallingId');
  };

  var acceptChecker = function (easyrtcId, CB) {
    $('#call-accept-container').show();

    var acceptMsg = 'Accept video call from ';
        acceptMsg += easyrtc.idToName(easyrtcId) + '?';

    if (easyrtc.getConnectionCount() > 0) {
      acceptMsg += ' Previous hangout will be disconnected.';
    }

    $('.call-accept-label').text(acceptMsg);

    var _mediaSuccessCB = function () {
      VideoChat.renderLocalStream();
      CB(true);
      Session.set('otherEasyrtcId', easyrtcId);
    };

    var mediaSuccessCB = (function () {
      return _mediaSuccessCB;
    })(easyrtcId, CB);

    var mediaErrorCB = function (errCode, errText) {
      $('.errMsg').text(errText);
      $('.errMsg').show().delay(5000).fadeOut();
    };

    var acceptTheCall = function() {
      $('#call-accept-container').hide();
      if (Session.get('room').roomtype != 'video') {
        $('#video-server-link').click();
      }
      if (easyrtc.getLocalStream()) {
        _mediaSuccessCB();
      } else {
        easyrtc.initMediaSource(_mediaSuccessCB, mediaErrorCB);
      }
    };

    var rejectTheCall = function () {
      $('#call-accept-container').hide();
      CB(false);
    };

    $('#call-accept-btn').click(function () {
      acceptTheCall();
    });
    $('#call-reject-btn').click(function () {
      rejectTheCall();
    });
  };

  var streamAcceptor = function (easyrtcId, stream) {
    VideoChat.remoteStream = stream;
    VideoChat.renderRemoteStream();
  };

  var onStreamClosed = function (easyrtcId) {
    if (Session.get('otherEasyrtcId') == easyrtcId) {
      Session.set('otherEasyrtcId');
      Session.set('videoCallingId');
      VideoChat.remoteStream = '';
      VideoChat.renderRemoteStream();
    }
  };

  return {
    options: {
      'appName': 'waartaa',
      'socketUrl': null,
      'reconnectTime': 10000 // in milliseconds
    },

    init: function (opt) {
      if (typeof easyrtc === 'undefined')
        return;

      $.extend(this.options, opt);
      options = this.options;
      Session.set('easyrtcStatus', 'connecting');

      if (options.socketUrl)
        easyrtc.setSocketUrl(options.socketUrl);

      easyrtc.setUsername(Meteor.user().username);
      easyrtc.connect(options.appName, connectSuccessCB, connectErrorCB);
      easyrtc.setDisconnectListener(disconnectListener);
      easyrtc.setRoomOccupantListener(roomListener);
      easyrtc.setAcceptChecker(acceptChecker);
      easyrtc.setStreamAcceptor(streamAcceptor);
      easyrtc.setOnStreamClosed(onStreamClosed);
    },

    performCall: function (otherEasyrtcId) {
      var hangout = true;
      if (easyrtc.getConnectionCount() > 0) {
        var c = confirm('Current hangout will be closed. Do you want to continue?');
        hangout = c;
      }
      if (!hangout)
        return;

      Session.set('videoCallingId', otherEasyrtcId);

      var _mediaSuccessCB = function () {
        VideoChat.renderLocalStream();
        easyrtc.call(otherEasyrtcId, successCB, errorCB, acceptedCB);
      }

      var mediaSuccessCB = (function () {
        return _mediaSuccessCB;
      })(otherEasyrtcId);

      var mediaErrorCB = function (errCode, errText) {
        $('.errMsg').text(errText);
        $('.errMsg').show().delay(5000).fadeOut();
      };

      easyrtc.hangupAll();
      if (easyrtc.getLocalStream()) {
        _mediaSuccessCB();
      } else {
        easyrtc.initMediaSource(mediaSuccessCB, mediaErrorCB);
      }
    },

    renderLocalStream: function () {
      var videoObj = document.getElementById('self-video');
      if(!videoObj)
        return;
      var stream = easyrtc.getLocalStream();
      if (stream) {
        easyrtc.setVideoObjectSrc(videoObj, stream);
        $('#self-video-container').show();
      } else {
        $('#self-video-container').hide();
      }
    },

    renderRemoteStream: function () {
      var videoObj = document.getElementById('remote-video');
      if(!videoObj)
        return;
      var stream = this.remoteStream;
      if (stream) {
        easyrtc.setVideoObjectSrc(videoObj, stream);
        $('#remote-video-container').show();
      } else {
        $('#remote-video-container').hide();
      }
    },

    hangup: function (otherEasyrtcId) {
      easyrtc.hangup(otherEasyrtcId);
    },

    selfUsername: function () {
      var id = Session.get('selfEasyrtcId');
      if (id) {
        var username = easyrtc.idToName(id);
        return username;
      }
    },

    remoteUsername: function () {
      var id = Session.get('otherEasyrtcId');
      if (id) {
        var username = easyrtc.idToName(id);
        return username;
      }
    }
  }
})();
