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
require.paths.push("../lib");

var assert = require("assert");
var jsonrpc = require("jsonrpc");

var callHistory = [];

function callHistoryWrapper(func){
    return function(){
        callHistory.push({
            method: func,
            params: arguments
        });
        return func.apply(null, arguments);
    }
}

var server = new jsonrpc.Server();
server.setEnvironment({
    "min": callHistoryWrapper(Math.min),
    "floor": callHistoryWrapper(Math.floor),
    "throwError": callHistoryWrapper(throwError)
});

function throwError(){
    throw Error("test error call");
}

(function(){
   
    callHistory = [];
    
    var response = server.processRequest(JSON.stringify({
        jsonrpc: "2.0",
        method: "min",
        params: [2, 1],
        id: 1
    }));
    
    assert.equal(callHistory.length, 1);
    assert.equal(callHistory[0].method, Math.min);
    assert.equal(callHistory[0].params.length, 2);
    assert.equal(callHistory[0].params[0], 2);
    assert.equal(callHistory[0].params[1], 1);
    
    response.then(function(serializedResponse){
        
        var response = JSON.parse(serializedResponse);
        
        assert.equal(response.jsonrpc, "2.0");
        assert.equal(response.result, 1);
        assert.equal(response.id, 1);
        
    }, assert.fail);
    
})();

(function(){
    
    callHistory = [];
    
    var response = server.processRequest(JSON.stringify([
        {jsonrpc:"2.0", method:"min", params:[3,4], id:1},
        {jsonrpc:"2.0", method:"floor", params:[5.4], id:"floorcall"}
    ]));
    
    assert.equal(callHistory.length, 2);
    
    assert.equal(callHistory[0].method, Math.min);
    assert.equal(callHistory[0].params.length, 2);
    assert.equal(callHistory[0].params[0], 3);
    assert.equal(callHistory[0].params[1], 4);
    
    assert.equal(callHistory[1].method, Math.floor);
    assert.equal(callHistory[1].params.length, 1);
    assert.equal(callHistory[1].params[0], 5.4);
    
    response.then(function(serializedResponse){
        
        var response = JSON.parse(serializedResponse);
        
        assert.equal(response.length, 2);
        
        assert.equal(response[0].jsonrpc, "2.0");
        assert.equal(response[0].result, 3);
        assert.equal(response[0].id, 1);
        
        assert.equal(response[1].jsonrpc, "2.0");
        assert.equal(response[1].result, 5);
        assert.equal(response[1].id, "floorcall");
        
    }, assert.fail);
    
})();

(function(){
    
    callHistory = [];
    
    var response = server.processRequest(JSON.stringify({
        jsonrpc:"2.0", method:"throwError", id:1
    }));
    
    response.then(function(serializedResponse){
        
        var response = JSON.parse(serializedResponse);
        
        assert.equal(response.jsonrpc, "2.0");
        assert.ok(!response.result);
        assert.equal(response.error.constructor, Object);
        assert.equal(response.error.code, -32500);
        assert.equal(response.error.message.constructor, String);
        assert.equal(response.id, 1);
        
    }, assert.fail);
    
})();

(function(){

    callHistory = [];
    
    var response = server.processRequest(JSON.stringify({
        jsonrpc:"2.0", method:"testMethodNotFound", params:[], id:1
    }));
    
    response.then(function(serializedResponse){
        
        var response = JSON.parse(serializedResponse);
        
        assert.equal(response.jsonrpc, "2.0");
        assert.equal(response.error.constructor, Object);
        assert.equal(response.error.code, -32601);
        assert.equal(response.error.message.constructor, String);
        assert.equal(response.id, 1);
        
    }, assert.fail);

})();

(function(){

    callHistory = [];
    
    var response = server.processRequest("testParseError");
    
    assert.equal(callHistory.length, 0);
    
    response.then(function(serializedResponse){
        
        var response = JSON.parse(serializedResponse);
        
        assert.equal(response.jsonrpc, "2.0");
        assert.equal(response.error.constructor, Object);
        assert.equal(response.error.code, -32700);
        assert.equal(response.error.message.constructor, String);
        
    }, assert.fail);

})();

(function(){

    callHistory = [];
    
    var response = server.processRequest(JSON.stringify([
        {jsonrpc:"2.0", method:{}, id:1},
        {jsonrpc:"2.0", method:"min", params:[1,2], id:2}
    ]));
    
    assert.equal(callHistory.length, 1);
    
    response.then(function(serializedResponse){
        
        var response = JSON.parse(serializedResponse);
        
        assert.equal(response.length, 2);
        
        assert.equal(response[0].jsonrpc, "2.0");
        assert.equal(response[0].error.constructor, Object);
        assert.equal(response[0].error.code, -32600);
        assert.equal(response[0].error.message.constructor, String);
        
        assert.equal(response[1].jsonrpc, "2.0");
        assert.equal(response[1].result, 1);
        assert.equal(response[1].id, 2);
        
    }, assert.fail);

})();

// Notification test case
(function(){

    callHistory = [];
    
    var response = server.processRequest(JSON.stringify({
        jsonrpc:"2.0", method:"min", params:[1,2]
    }));
    
    assert.equal(callHistory.length, 1);
    assert.equal(callHistory[0].method, Math.min);
    assert.equal(callHistory[0].params.length, 2);
    assert.equal(callHistory[0].params[0], 1);
    assert.equal(callHistory[0].params[1], 2);
    
    response.then(function(serializedResponse){
        assert.ok(!serializedResponse);
    }, assert.fail);
    
})();

(function(){
    
    var client = new jsonrpc.Client();
    
    client.setTimeout(-1);
    
    var calledMinResult = false;
    var calledFloorResult = false;
    
    client.remoteCall("min", [1, 2]).then(function(result){
        assert.equal(result, 1);
        calledMinResult = true;
    }, assert.fail);
    
    client.remoteCall("floor", [5.2]).then(function(result){
        assert.equal(result, 5);
        calledFloorResult = true;
    }, assert.fail)
    
    var requests = JSON.parse(client.popRequests());
    
    assert.equal(requests.length, 2);
    
    assert.equal(requests[0].jsonrpc, "2.0");
    assert.equal(requests[0].method, "min");
    assert.equal(requests[0].params.length, 2);
    assert.equal(requests[0].params[0], 1);
    assert.equal(requests[0].params[1], 2);
    assert.equal(requests[0].id, 1);
    
    assert.equal(requests[1].jsonrpc, "2.0");
    assert.equal(requests[1].method, "floor");
    assert.equal(requests[1].params.length, 1);
    assert.equal(requests[1].params[0], 5.2);
    assert.equal(requests[1].id, 2);
    
    client.processResponse(JSON.stringify([
        {jsonrpc:"2.0", result:1, id:1},
        {jsonrpc:"2.0", result:5, id:2}
    ]));
    
    process.on("exit", function(){
        assert.ok(calledMinResult);
        assert.ok(calledFloorResult);
    });
})();

// Remote Call Timeout test case
(function(){

    var client = new jsonrpc.Client();
    
    client.setTimeout(-1);
    
    var calledMinError = false;
    
    client.remoteCall("min", [1,2]).then(assert.fail, function(){
        calledMinError = true;
    });
    
    client.processResponse(JSON.stringify({
        jsonrpc:"2.0", 
        error:{
            code:-32601,
            message:"method not found"
        },
        id:1
    }));
    
    process.on("exit", function(){
        assert.ok(calledMinError);
    });
})();

// Remote Call Timeout test case
(function(){

    var client = new jsonrpc.Client();
    
    client.setTimeout(0);
    
    var calledMinError = false;
    
    client.remoteCall("min", [1,2]).then(assert.fail, function(){
        calledMinError = true;
    });
        
    process.on("exit", function(){
        assert.ok(calledMinError);
    });
})();

