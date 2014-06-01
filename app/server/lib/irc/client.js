/**
 * Manage node-irc client instances for user servers.
 *
 * @module
 *
 */
clientManager = (function () {

  var clients = {};

  // Load SSL credentials
  var sslCredentials;
  try {
      var privateKey = Assets.getText('certs/privatekey.pem');
      var certificate = Assets.getText('certs/certificate.pem');
      sslCredentials = crypto.createCredentials({
          key: privateKey, cert: certificate});
      delete privatekey;
      delete certificate;
  } catch (err) {
      sslCredentials = false;
  }

  return {
    /**
     * Initialize or get an existing node-irc client instance for a
     * user server.
     *
     * @param {string} userId
     * @param {string} serverName
     * @param {string} nick
     * @param {object} opts
     *
     * @returns {object} node-irc client instance
     */
    init: function (userId, serverName, nick, opts) {
      opts = opts || {};
      var client = (clients[userId] || {})[serverName];
      if ( client )
        return client;
      var server = Servers.findOne({name: serverName});
      if ( !server )
        return;
      var realName = opts.realName || '~';
      var serverUrl = server.connections[0].url;
      var serverPort = sslCredentials? '6607': (
        server.connections[0].port || '6667');
      var nick = userServer.nick;
      var client_options = {
          autoConnect: false,
          port: serverPort,
          userName: nick,
          realName: realName,
          secure: sslCredentials,
          selfSigned: true,
          certExpired: true,
          debug: opts.debug
      };
      client = new irc.Client(serverUrl, nick, client_options);
      clients[userId]? (
        clients[userId][serverName] = client):
        (clients[userId] = {};
         clients[userId][serverName] = client);
      return client;
    },
    /**
     * Get an instance of node-irc client for a user server.
     *
     * @param {string} userId
     * @param {string} serverName
     *
     * @returns {object} An instance of node-irc client
     */
    get: function (userId, serverName) {
      return (clients[userId] || {})[serverName];
    }
  };
})();
