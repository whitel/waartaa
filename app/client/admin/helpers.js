waartaa.admin.helpers = {
  'searchUserServers': function (search, pageNo, sort) {
    Meteor.call('searchUserServers', search, pageNo, sort,
      function (err, result) {
        if (!err) {
          Session.set('user_servers_search_result', result);
          Session.set('user_servers_search_error');
        } else {
          Session.set('user_servers_search_error', err);
          Session.set('user_servers_search_result');
        }
      }
    );
  }
};
