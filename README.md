# node-jsonrpc #

node-jsonrpc is a node.js module implementation of JSON-RPC 2.0 client and 
server. The module exports two core classes, <code>Client</code> and 
<code>Server</code> which are both transport agnostic and don't perform any IO 
operations on their own, and a Http client class and a server request handler 
function.

## API ##

* Client()
* Client.setTimeout(timeout)
* Client.remoteCall(method, params, [timeout])
* Client.popRequests()
* Client.processResponse(serializedResponse)
* Client.cancel([code], [message])

* Server()
* Server.setEnvironment()
* Server.processRequest(serializedRequest)

* HttpClient(options)
* HttpClient.setMethod(method)
* HttpClient.setTimeout(timeout)
* HttpClient.remoteCall(method, params, [timeout])
* HttpClient.send()

* createHttpRequestHandler(server)

## HTTP Client Usage ##

```javascript
var jsonrpc = require("jsonrpc");

var client = new jsonrpc.HttpClient("http://localhost:8080/jsonrpc-endpoint");

client.remoteCall("random").then(console.log, console.log);
client.send();
```

## HTTP Server Usage ##

```javascript
var http = require("http");
var jsonrpc = require("jsonrpc");

var remoteMath = jsonrpc.createHttpRequestHandler(Math);

var server = http.createServer(remoteMath);
server.listen(8080);
```

