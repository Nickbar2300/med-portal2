module.exports = function (context, req) {
  context.res = { body: "pong" };
  context.done();
};
