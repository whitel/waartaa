Template.admin.created = function () {
  waartaa.admin.helpers.searchUserServers();
}

var _callbackSearch = function () {
  var search = $('#search-message').val();
  Session.set('user_servers_search_message');
  waartaa.admin.helpers.searchUserServers(search);
};

Template.admin.events = {
  'click #search-button': function () {
    _callbackSearch();
  },

  'keyup #search-message': function (e) {
    if (e.keyCode == 13) {
      _callbackSearch();
    }
  }
};
