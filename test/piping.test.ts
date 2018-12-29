import * as piping  from '../src/piping';
import * as assert from 'power-assert';
import * as http from "http";
import thenRequest from "then-request";
import * as request from "request";
import * as pkginfo from "pkginfo";
import * as getPort from "get-port";

// Set module.exports.version
pkginfo(module, 'version');

/**
 * Listen on the specify port
 * @param server
 * @param port
 */
function listenPromise(server: http.Server, port: number): Promise<void> {
  return new Promise<void>((resolve)=>{
    server.listen(port, resolve);
  });
}

/**
 * Close the server
 * @param server
 */
function closePromise(server: http.Server): Promise<void> {
  return new Promise<void>((resolve)=>{
    server.close(resolve);
  });
}

// Sleep
// (from: https://qiita.com/yuba/items/2b17f9ac188e5138319c)
export function sleep(ms: number): Promise<any> {
  return new Promise(resolve => setTimeout(resolve, ms));
}


describe('piping.Server', () => {
  let pipingServer: http.Server;
  let pipingPort: number;
  let pipingUrl: string;

  beforeEach(async ()=>{
    // Get available port
    pipingPort = await getPort();
    // Define Piping URL
    pipingUrl = `http://localhost:${pipingPort}`;
    // Create a Piping server
    pipingServer = http.createServer(new piping.Server(false).handler);
    // Listen on the port
    await listenPromise(pipingServer, pipingPort);
  });

  afterEach(async ()=>{
    // Close the piping server
    await closePromise(pipingServer);
  });

  context("In reserved path", ()=>{
    it('should return index page', async () => {
      // Get response
      const res1 = await thenRequest("GET", `${pipingUrl}`);
      const res2 = await thenRequest("GET", `${pipingUrl}/`);

      // Body should be index page
      assert.equal(res1.getBody("UTF-8").includes("Piping"), true);
      assert.equal(res2.getBody("UTF-8").includes("Piping"), true);
    });

    it('should return version page', async () => {
      // Get response
      const res = await thenRequest("GET", `${pipingUrl}/version`);

      // Body should be index page
      // (from: https://stackoverflow.com/a/22339262/2885946)
      assert.equal(res.getBody("UTF-8"), module.exports.version+"\n");
    });

    it('should not allow user to send the reserved paths', async () => {
      // Send data to ""
      const req1 = await thenRequest("POST", `${pipingUrl}`, {
        body: "this is a content"
      });
      // Should be failed
      assert.equal(req1.statusCode, 400);

      // Send data to "/"
      const req2 = await thenRequest("POST", `${pipingUrl}/`, {
        body: "this is a content"
      });
      // Should be failed
      assert.equal(req2.statusCode, 400);

      // Send data to "/version"
      const req3 = await thenRequest("POST", `${pipingUrl}/`, {
        body: "this is a content"
      });
      // Should be failed
      assert.equal(req3.statusCode, 400);
    });
  });

  it('should handle connection (receiver O, sender: O)', async () => {
    // Get request promise
    const reqPromise = thenRequest("GET", `${pipingUrl}/mydataid`);

    // Send data
    await thenRequest("POST", `${pipingUrl}/mydataid`, {
      body: "this is a content"
    });

    // Get data
    const data = await reqPromise;

    // Body should be the sent data
    assert.equal(data.getBody("UTF-8"), "this is a content");
    // Content-length should be returned
    assert.equal(data.headers["content-length"], "this is a content".length);
  });

  it('should handle connection (sender: O, receiver: O)', async () => {
    // Send data
    // (NOTE: Should NOT use `await` because of blocking a GET request)
    thenRequest("POST", `${pipingUrl}/mydataid`, {
      body: "this is a content"
    });

    // Get data
    const data = await thenRequest("GET", `${pipingUrl}/mydataid`);

    // Body should be the sent data
    assert.equal(data.getBody("UTF-8"), "this is a content");
    // Content-length should be returned
    assert.equal(data.headers["content-length"], "this is a content".length);
  });

  it('should be sent chunked data', async () => {
    // Create a send request
    const sendReq = http.request({
      host: "localhost",
      port: pipingPort,
      method: "POST",
      path: `/mydataid`
    });

    // Send chunked data
    sendReq.write("this is");
    sendReq.end(" a content");

    // Get data
    const data = await thenRequest("GET", `${pipingUrl}/mydataid`);

    // Body should be the sent data
    assert.equal(data.getBody("UTF-8"), "this is a content");
  });

  it('should be sent by PUT method', async () => {
    // Send data
    // (NOTE: Should NOT use `await` because of blocking a GET request)
    thenRequest("PUT", `${pipingUrl}/mydataid`, {
      body: "this is a content"
    });

    // Get data
    const data = await thenRequest("GET", `${pipingUrl}/mydataid`);

    // Body should be the sent data
    assert.equal(data.getBody("UTF-8"), "this is a content");
    // Content-length should be returned
    assert.equal(data.headers["content-length"], "this is a content".length);
  });

  it('should handle multi receiver connection (receiver?n=3: O, receiver?n=3: O, receiver?n=3: O, sender?n=3: O)', async () => {
    // Get request promise
    const dataPromise1 = thenRequest("GET", `${pipingUrl}/mydataid?n=3`);
    const dataPromise2 = thenRequest("GET", `${pipingUrl}/mydataid?n=3`);
    const dataPromise3 = thenRequest("GET", `${pipingUrl}/mydataid?n=3`);

    // Send data
    thenRequest("POST", `${pipingUrl}/mydataid?n=3`, {
      body: "this is a content"
    });

    // Await all data
    const [data1, data2, data3] = await Promise.all([dataPromise1, dataPromise2, dataPromise3]);

    // Body should be the sent data and content-length should be returned
    assert.equal(data1.getBody("UTF-8"), "this is a content");
    assert.equal(data1.headers["content-length"], "this is a content".length);
    assert.equal(data2.getBody("UTF-8"), "this is a content");
    assert.equal(data2.headers["content-length"], "this is a content".length);
    assert.equal(data3.getBody("UTF-8"), "this is a content");
    assert.equal(data3.headers["content-length"], "this is a content".length);
  });

  it('should handle multi receiver connection (sender?n=3: O, receiver?n=3: O, receiver?n=3: O, receiver?n=3: O)', async () => {
    // Send data
    // (NOTE: Should NOT use `await` because of blocking GET requests)
    thenRequest("POST", `${pipingUrl}/mydataid?n=3`, {
      body: "this is a content"
    });

    // Get data
    const dataPromise1 = thenRequest("GET", `${pipingUrl}/mydataid?n=3`);
    const dataPromise2 = thenRequest("GET", `${pipingUrl}/mydataid?n=3`);
    const dataPromise3 = thenRequest("GET", `${pipingUrl}/mydataid?n=3`);

    // Await all data
    const [data1, data2, data3] = await Promise.all([dataPromise1, dataPromise2, dataPromise3]);

    // Body should be the sent data and content-length should be returned
    assert.equal(data1.getBody("UTF-8"), "this is a content");
    assert.equal(data1.headers["content-length"], "this is a content".length);
    assert.equal(data2.getBody("UTF-8"), "this is a content");
    assert.equal(data2.headers["content-length"], "this is a content".length);
    assert.equal(data3.getBody("UTF-8"), "this is a content");
    assert.equal(data3.headers["content-length"], "this is a content".length);
  });

  it('should handle multi receiver connection (receiver?n=3: O, sender?n=3: O, receiver?n=3: O, receiver?n=3: O)', async () => {

    // Get data
    const dataPromise1 = thenRequest("GET", `${pipingUrl}/mydataid?n=3`);

    // Send data
    // (NOTE: Should NOT use `await` because of blocking GET requests)
    thenRequest("POST", `${pipingUrl}/mydataid?n=3`, {
      body: "this is a content"
    });

    // Get data
    const dataPromise2 = thenRequest("GET", `${pipingUrl}/mydataid?n=3`);
    const dataPromise3 = thenRequest("GET", `${pipingUrl}/mydataid?n=3`);

    // Await all data
    const [data1, data2, data3] = await Promise.all([dataPromise1, dataPromise2, dataPromise3]);

    // Body should be the sent data and content-length should be returned
    assert.equal(data1.getBody("UTF-8"), "this is a content");
    assert.equal(data1.headers["content-length"], "this is a content".length);
    assert.equal(data2.getBody("UTF-8"), "this is a content");
    assert.equal(data2.headers["content-length"], "this is a content".length);
    assert.equal(data3.getBody("UTF-8"), "this is a content");
    assert.equal(data3.headers["content-length"], "this is a content".length);
  });

  it('should handle multi receiver connection (receiver?n=2: O, sender?n=1: X: because too less n)', async () => {
    // Get data
    const getReq1 = request.get( {
      url: `${pipingUrl}/mydataid?n=2`
    });

    await sleep(10);

    // Send data
    const sendData = await thenRequest("POST", `${pipingUrl}/mydataid?n=1`, {
      body: "this is a content"
    });

    // Should be rejected
    assert.equal(sendData.statusCode, 400);

    // Quit get request
    getReq1.abort();
  });

  it('should handle multi receiver connection (receiver?n=2: O, sender?n=3: X: because too much n)', async () => {
    // Get data
    const getReq1 = request.get( {
      url: `${pipingUrl}/mydataid?n=2`
    });

    await sleep(10);

    // Send data
    const sendData = await thenRequest("POST", `${pipingUrl}/mydataid?n=3`, {
      body: "this is a content"
    });

    // Should be rejected
    assert.equal(sendData.statusCode, 400);

    // Quit get request
    getReq1.abort();
  });

  it('should handle multi receiver connection (sender?n=2: O, receiver?n=1: X: because too less n)', async () => {
    // Create send request
    const sendReq = http.request( {
      host: "localhost",
      port: pipingPort,
      method: "POST",
      path: `/mydataid?n=2`
    });
    // Send content-length
    sendReq.setHeader("Content-Length", "this is a content".length);
    // Send chunk of data
    sendReq.end("this is a content");

    await sleep(10);

    // Get data
    const dataPromise1 = thenRequest("GET", `${pipingUrl}/mydataid?n=1`);

    // Await data
    const data1 = await dataPromise1;

    // Should be rejected
    assert.equal(data1.statusCode, 400);

    // Quit send request
    sendReq.abort();
  });

  it('should handle multi receiver connection (sender?n=2: O, receiver?n=3: X: because too much n)', async () => {
    // Create send request
    const sendReq = http.request( {
      host: "localhost",
      port: pipingPort,
      method: "POST",
      path: `/mydataid?n=2`
    });
    // Send content-length
    sendReq.setHeader("Content-Length", "this is a content".length);
    // Send chunk of data
    sendReq.end("this is a content");

    await sleep(10);

    // Get data
    const dataPromise1 = thenRequest("GET", `${pipingUrl}/mydataid?n=3`);

    // Await data
    const data1 = await dataPromise1;

    // Should be rejected
    assert.equal(data1.statusCode, 400);

    // Quit send request
    sendReq.abort();
  });

  it('should handle multi receiver connection (receiver?n=2: O, receiver?n=2: O, receiver?n=3: X)', async () => {
    // Get data
    const getReq1 = request.get({
      url: `${pipingUrl}/mydataid?n=2`
    });
    const getReq2 = request.get({
      url: `${pipingUrl}/mydataid?n=2`
    });
    const getReqPromise3: Promise<request.Response> = new Promise(resolve =>
      request.get({
        url: `${pipingUrl}/mydataid?n=2`
      }, (err, response, body)=>{
        resolve(response);
      })
    );
    // Should be rejected
    assert.equal((await getReqPromise3).statusCode, 400);
    // Quit get requests
    getReq1.abort();
    getReq2.abort();
  });

  it('should handle multi receiver connection (receiver?n=2: O, receiver?n=2: O, sender?n=1: X: because too less)', async () => {
    // Get data
    const getReq1 = request.get({
      url: `${pipingUrl}/mydataid?n=2`
    });
    const getReq2 = request.get({
      url: `${pipingUrl}/mydataid?n=2`
    });

    await sleep(10);

    // Send data
    const sendData = await thenRequest("POST", `${pipingUrl}/mydataid?n=1`, {
      body: "this is a content"
    });

    // Should be rejected
    assert.equal(sendData.statusCode, 400);

    // Quit get requests
    getReq1.abort();
    getReq2.abort();
  });

  it('should handle multi receiver connection (receiver?n=2: O, receiver?n=2: O, sender?n=3: X: because too much)', async () => {
    // Get data
    const getReq1 = request.get({
      url: `${pipingUrl}/mydataid?n=2`
    });
    const getReq2 = request.get({
      url: `${pipingUrl}/mydataid?n=2`
    });

    await sleep(10);

    // Send data
    const sendData = await thenRequest("POST", `${pipingUrl}/mydataid?n=3`, {
      body: "this is a content"
    });

    // Should be rejected
    assert.equal(sendData.statusCode, 400);

    // Quit get requests
    getReq1.abort();
    getReq2.abort();
  });

  it('should handle multi receiver connection (sender?n=2: O, receiver?n=2 O, receiver?n=3: X: because too much)', async () => {
    // Create send request
    const sendReq = http.request( {
      host: "localhost",
      port: pipingPort,
      method: "POST",
      path: `/mydataid?n=2`
    });
    // Send content-length
    sendReq.setHeader("Content-Length", "this is a content".length);
    // Send chunk of data
    sendReq.end("this is a content");

    await sleep(10);

    // Get data
    const getReq1 = request.get({
      url: `${pipingUrl}/mydataid?n=2`
    });
    await sleep(10);
    const data2 = await thenRequest("GET", `${pipingUrl}/mydataid?n=3`);

    // Should be rejected
    assert.equal(data2.statusCode, 400);

    // Quit get request
    getReq1.abort();
    // Quit send request
    sendReq.abort();
  });

  it('should handle multi receiver connection (sender?n=2: O, receiver?n=2 O, receiver?n=1: X: because too less)', async () => {
    // Create send request
    const sendReq = http.request( {
      host: "localhost",
      port: pipingPort,
      method: "POST",
      path: `/mydataid?n=2`
    });
    // Send content-length
    sendReq.setHeader("Content-Length", "this is a content".length);
    // Send chunk of data
    sendReq.end("this is a content");

    await sleep(10);

    // Get data
    const getReq1 = request.get({
      url: `${pipingUrl}/mydataid?n=2`
    });
    await sleep(10);
    const data2 = await thenRequest("GET", `${pipingUrl}/mydataid?n=1`);

    // Should be rejected
    assert.equal(data2.statusCode, 400);

    // Quit get request
    getReq1.abort();
    // Quit send request
    sendReq.abort();
  });

  it('should handle multi receiver connection (sender?n=2: O, receiver?n=2: O, receiver?n=2: O, receiver?n=2: X) to ensure gradual sending', async () => {
    // Create send request
    const sendReq = http.request( {
      host: "localhost",
      port: pipingPort,
      method: "POST",
      path: `/mydataid?n=2`
    });
    // Send content-length
    sendReq.setHeader("Content-Length", "this is a content".length);
    // Send chunk of data
    sendReq.write("this is");

    // Get request promises
    // (NOTE: Each sleep is to ensure the order of requests)
    const dataPromise1 = thenRequest("GET", `${pipingUrl}/mydataid?n=2`);
    await sleep(10);
    const dataPromise2 = thenRequest("GET", `${pipingUrl}/mydataid?n=2`);
    await sleep(10);
    const dataPromise3 = thenRequest("GET", `${pipingUrl}/mydataid?n=2`);
    await sleep(10);

    // End send data
    sendReq.end(" a content");

    // Await all data
    const [data1, data2, data3] = await Promise.all([dataPromise1, dataPromise2, dataPromise3]);

    // Body should be the sent data
    assert.equal(data1.getBody("UTF-8"), "this is a content");
    assert.equal(data2.getBody("UTF-8"), "this is a content");

    // Should be bad request
    assert.equal(data3.statusCode, 400);
  });

  it('should handle multi receiver connection (receiver?n=2: O, receiver?n=2: O, receiver?n=2: X, sender?n=2: O)', async () => {
    // Get request promises
    // (NOTE: Each sleep is to ensure the order of requests)
    const dataPromise1 = thenRequest("GET", `${pipingUrl}/mydataid?n=2&tag=first`);
    await sleep(10);
    const dataPromise2 = thenRequest("GET", `${pipingUrl}/mydataid?n=2&tag=second`);
    await sleep(10);
    const dataPromise3 = thenRequest("GET", `${pipingUrl}/mydataid?n=2&tag=third`);
    await sleep(10);

    // Send data
    thenRequest("POST", `${pipingUrl}/mydataid?n=2`, {
      body: "this is a content"
    });

    // Await all data
    const [data1, data2, data3] = await Promise.all([dataPromise1, dataPromise2, dataPromise3]);

    // Body should be the sent data
    assert.equal(data1.getBody("UTF-8"), "this is a content");
    assert.equal(data2.getBody("UTF-8"), "this is a content");

    // Should be bad request
    assert.equal(data3.statusCode, 400);
  });

  context("If number of receivers <= 0", ()=>{
    it('should not allow n=0', async () => {
      // Send data
      const res = await thenRequest("POST", `${pipingUrl}/mydataid?n=0`, {
        body: "this is a content"
      });

      // Should be rejected
      assert.equal(res.statusCode, 400);
    });

    it('should not allow n=-1', async () => {
      // Send data
      const res = await thenRequest("POST", `${pipingUrl}/mydataid?n=-1`, {
        body: "this is a content"
      });

      // Should be rejected
      assert.equal(res.statusCode, 400);
    });
  });

});
