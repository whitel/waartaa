Template.admin_sidebar.helpers({
  'isRouteActive': function (routeName) {
    var currentPath = Router.current().path;
    // chop '/' from the end
    currentPath = currentPath.replace(/\/$/, '');
    if (routeName == 'admin-nick-status' && currentPath=='/admin/nick-status')
      return 'active';
  }
});
