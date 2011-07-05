/*
    JSON-RPC 2.0 Client and Server Classes
    
    Copyright (C) 2011 Graham Daws <graham.daws@gmail.com>
    
    Permission is hereby granted, free of charge, to any person obtaining a 
    copy of this software and associated documentation files (the "Software"),
    to deal in the Software without restriction, including without limitation
    the rights to use, copy, modify, merge, publish, distribute, sublicense, 
    and/or sell copies of the Software, and to permit persons to whom the 
    Software is furnished to do so, subject to the following conditions:
    
    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.
    
    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
    FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
    DEALINGS IN THE SOFTWARE.
*/
var Deferred = require("promise").Deferred;
var when = require("promise").when;
var http = require("http");
var url = require("url");
var events = require("events");
var util = require("util");
var parse = JSON.parse;
var serialize = JSON.stringify;

const JSON_RPC_VERSION = "2.0";
const JSON_RPC_PARSE_ERROR_CODE = -32700;
const JSON_RPC_INVALID_REQUEST_CODE = -32600;
const JSON_RPC_METHOD_NOT_FOUND_CODE = -32601;
const JSON_RPC_INVALID_PARAMS_CODE = -32602;
const JSON_RPC_INTERNAL_ERROR_CODE = -32603;
const JSON_RPC_SYSTEM_ERROR_CODE = -32400;
const JSON_RPC_APPLICATION_ERROR_CODE = -32500;
const JSON_RPC_TRANSPORT_ERROR_CODE = -32300;

const CLIENT_REQUEST_TIMEOUT = 10000;
const CONTENT_TYPE = "application/json-rpc";
const HTTP_BODY_ENCODING = "utf-8";

function Client(){
    this._nextID = 1;
    this._requests = {};
    this._outgoing = [];
    this._timeout = CLIENT_REQUEST_TIMEOUT;
}

Client.prototype.setTimeout = function(timeout){
    var oldTimeout = this._timeout;
    this._timeout = timeout;
    return oldTimeout;
}

Client.prototype.remoteCall = function(method, params, timeout){
    
    if(method.constructor != String){
        throw "Invalid method argument (expected string)";
    }
    
    if(params.constructor != Array){
        throw "Invalid params argument (expected array)";
    }
    
    timeout = timeout || this._timeout;
    
    var id = this._nextID++;
    
    var requestMessage = {
        jsonrpc: JSON_RPC_VERSION,
        method: method,
        params: params,
        id: id
    }
    this._outgoing.push(requestMessage);
    
    var result = new Deferred();
    
    var response = {
        result: result
    }
    this._requests[id] = response;
    
    if(timeout >= 0){
        var self = this;
        response.timeout = setTimeout(function(){
            
            result.reject(
                createErrorResponse(JSON_RPC_TRANSPORT_ERROR_CODE, "timeout"));
            
            cleanupResponse.call(self, id);
        }, timeout);
    }
    
    return result.promise;
}

Client.prototype.popRequests = function(){

    var requests = serialize(
    this._outgoing.length == 1 ? this._outgoing[0] : this._outgoing);
    
    this._outgoing = [];
    return requests;
}

Client.prototype.processResponse = function(serializedResponse){
    
    var responses;
    
    try{
        responses = parse(serializedResponse);
    }
    catch(exception){
        return;
    }
    
    if(responses.constructor != Array){
        responses = [responses];
    }
    
    for(var i = 0, length = responses.length; i < length; i++){
        
        var response = responses[i];
        if(!isValidRPCResponse(response)){
            continue;
        }
        
        var request = this._requests[response.id];
        
        if(request){
        
            if(response.result !== undefined){
                request.result.resolve(response.result);
            }
            else{
                request.result.reject(response.error);
            }
            
            cleanupResponse.call(this, response.id);
        }
    }
}

Client.prototype.cancel = function(code, message){
    
    code = code || JSON_RPC_APPLICATION_ERROR_CODE;
    message = message || "cancelled";
    
    var requests = this._requests;
    for(id in requests){
        requests[id].result.reject(createErrorResponse(code, message));
        cleanupResponse.call(this, id);
    }
    
    this._requests = {};
    this._outgoing = [];
}

function cleanupResponse(requestID){
    var response = this._requests[requestID];
    if(response.timeout){
        clearTimeout(response.timeout);
    }
    delete this._requests[requestID];
}

function Server(){
    this._environment = {};
}

Server.prototype.setEnvironment = function(environment){
    this._environment = environment;
}

Server.prototype.processRequest = function(serializedRequest){
    
    var requests;
    
    try{
        requests = parse(serializedRequest);
    }
    catch(exception){
        var ready = new Deferred();
        ready.resolve(serialize(createErrorResponse(JSON_RPC_PARSE_ERROR_CODE, 
        "parse error: " + exception)));
        return ready;
    }
    
    if(requests.constructor != Array){
        requests = [requests];
    }
    
    var orderedRequestIDArray = [];
    for(var i = 0, length = requests.length; i < length; i++){
        var request = requests[i];
        var id = request.id;
        if(id){
            orderedRequestIDArray.push(id);
        }
    }
    
    var responses = new ServerResponse(orderedRequestIDArray);
    
    for(var i = 0, length = requests.length; i < length; i++){
        
        var request = requests[i];
        var response = null;
        
        if(isValidRPCRequest(request)){
            
            var func = this._environment[request.method];
            if(func){
                
                request.params = request.params || [];
                
                // No real support for named parameters
                if(request.params.constructor == Object){
                    request.params = [request.params];
                }
                
                callFunction(func, request.params, request.id, responses);
            }
            else{
                response = createErrorResponse(
                    JSON_RPC_METHOD_NOT_FOUND_CODE, 
                    "method not found", request.id);
            }
        }
        else{
            response = createErrorResponse(JSON_RPC_INVALID_REQUEST_CODE, 
            "invalid request", request.id);
        }
        
        if(response){
            responses.addResponse(response);
        }
    }
    
    return responses.getResponsePromise();
}

function callFunction(func, params, requestID, responses){
    
    try{
        var result = func.apply(null, params);
        
        when(result, function(resultValue){
            responses.addResponse(createResultResponse(resultValue, requestID));
        });
    }
    catch(exception){
        responses.addResponse(createErrorResponse(
        JSON_RPC_APPLICATION_ERROR_CODE, "" + exception, requestID));
    }
}

function ServerResponse(orderedRequestIDArray){
    
    var responseOrder = {};
    var calls = orderedRequestIDArray.length;
    
    for(var i = 0; i < calls; i++){
        responseOrder[orderedRequestIDArray[i]] = i;
    }
    
    this._responseOrder = responseOrder;
    this._calls = calls;
    this._responses = [];
    this._ready = new Deferred();
    
    if(calls == 0){
        this._ready.resolve();
    }
}

ServerResponse.prototype.addResponse = function(response){
    
    if(!response.id){
        return;
    }
    
    this._responses.splice(this._responseOrder[response.id], 0, response);
    
    if(this._responses.length == this._calls){
    
        var responses = this._responses;
        
        if(responses.length == 1){
            responses = responses[0];
        }
        
        this._ready.resolve(serialize(responses));
    }
}

ServerResponse.prototype.getResponsePromise = function(){
    return this._ready.promise;
}

function isValidRPCRequest(request){
    return request.constructor == Object &&
    request.jsonrpc == JSON_RPC_VERSION &&
    request.method &&
    request.method.constructor == String &&
    (!request.params || request.params.constructor == Array || 
     request.params.constructor == Object
    ) &&
    (request.id == null || isValidID(request.id));
}

function isValidRPCResponse(response){
    return response.constructor == Object &&
    response.jsonrpc == JSON_RPC_VERSION &&
    (response.result !== undefined || response.error !== undefined) &&
    response.id
}

function isValidID(id){
    var ctor = id.constructor;
    return ctor == Number || ctor == String;
}

function createErrorResponse(code, message, id){
    return {
        jsonrpc: JSON_RPC_VERSION,
        error: {code: code, message: message},
        id: id
    };
}

function createResultResponse(result, id){
    return {
        jsonrpc: JSON_RPC_VERSION,
        result: result,
        id: id
    };
}

function HttpClient(options){
    
    events.EventEmitter.call(this);
    
    if(options.constructor == String){
        
        options = url.parse(options);
        
        if(options.protocol != "http:"){
            throw "expected http protocol";
        }
        
        options.host = options.hostname;
        options.path = options.pathname;
    }
    
    this._jsonrpc = new Client();
    
    this._host = options.host;
    this._port = options.port || 80;
    this._path = options.path;
    this._method = options.method || "POST";
}

util.inherits(HttpClient, events.EventEmitter);

HttpClient.prototype.remoteCall = function(){
    return this._jsonrpc.remoteCall.apply(this._jsonrpc, arguments);
}

HttpClient.prototype.setTimeout = function(){
    return this._jsonrpc.setTimeout.apply(this._jsonrpc, arguments);
}

HttpClient.prototype.setMethod = function(method){
    this._method = method;
}

HttpClient.prototype.send = function(){
    
    var request = http.request({
        host: this._host,
        port: this._port,
        method: this._method,
        path: this._path,
        headers:{
            "Content-Type": CONTENT_TYPE
        }
    });
    
    var self = this;
    
    request.on("response", function(response){
        
        if(response.statusCode != 200 && response.statusCode != 204){
            self.emit("error", "server responded with " + 
            response.statusCode + " status code.");
            return;
        }
        
        var contentType = response.headers["content-type"];
        if(contentType && contentType.indexOf(CONTENT_TYPE) == -1){
            self.emit("error", "server responded with unexpected content-type");
            return;
        }
        
        var buffer = "";
        
        response.setEncoding(HTTP_BODY_ENCODING);
        
        response.on("data", function(chunk){
            buffer += chunk;
        });
        
        response.on("end", function(){
            self._jsonrpc.processResponse(buffer);
        });
    });
    
    request.on("error", function(){
        self.emit("error", "");
    });
    
    request.write(this._jsonrpc.popRequests());
    request.end();
}

function createHttpRequestHandler(server){
    
    if(server.constructor == Object){
        environment = server;
        server = new Server();
        server.setEnvironment(environment);
    }
    
    if(server.constructor != Server){
        throw "invalid server argument (expected Server object)";
    }
    
    return function(request, response){
        
        var contentType = request.headers["content-type"];
        
        if(contentType && contentType.indexOf(CONTENT_TYPE) == -1){
            response.writeHead(415);
            response.end();
            return;
        }
        
        var buffer = "";
        
        request.setEncoding(HTTP_BODY_ENCODING);
        
        request.on("data", function(chunk){
            buffer += chunk;
        });
        
        request.on("end", function(){
            
            server.processRequest(buffer).then(function(serializedResponse){
                
                if(serializedResponse){
                    response.writeHead(200, {
                        "Content-Type": CONTENT_TYPE
                    });
                    response.write(serializedResponse);
                }
                else{
                    response.writeHead(204);
                }
                
                response.end();
            });
        });
    }
}

exports.Client = Client;
exports.Server = Server;
exports.HttpClient = HttpClient;
exports.createHttpRequestHandler = createHttpRequestHandler;

