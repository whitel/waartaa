Template.admin.created = function () {
  waartaa.admin.helpers.searchUserServers();
}

var _callbackSearch = function () {
  var search = $('#search-message').val();
  Session.set('user_servers_search_message', search);
  waartaa.admin.helpers.searchUserServers(search);
};

var _callbackNextPrev = function (page) {
  var search = Session.get('user_servers_search_message');
  waartaa.admin.helpers.searchUserServers(search, page);
};

Template.admin.events = {
  'click #search-button': function () {
    _callbackSearch();
  },

  'keyup #search-message': function (e) {
    if (e.keyCode == 13) {
      _callbackSearch();
    }
  },

  'click #previous-icon': function () {
    var currentPage = parseInt($('#page-no').attr('data-current-page'));
    var totalPages = parseInt($('#page-no').attr('data-total-pages'));
    if (currentPage > 1) {
      var page = currentPage - 1;
      _callbackNextPrev(page);
    }
  },

  'click #next-icon': function () {
    var currentPage = parseInt($('#page-no').attr('data-current-page'));
    var totalPages = parseInt($('#page-no').attr('data-total-pages'));
    if (currentPage < totalPages) {
      var page = currentPage + 1;
      _callbackNextPrev(page);
    }
  },

  'keyup #page-no': function (e) {
    if (e.keyCode == 13) {
      var page = parseInt($('#page-no').val());
      var currentPage = parseInt($('#page-no').attr('data-current-page'));
      var totalPages = parseInt($('#page-no').attr('data-total-pages'));
      if (page >= 1 && page <= totalPages && page!=currentPage) {
        _callbackNextPrev(page);
      }
    }
  }
};
