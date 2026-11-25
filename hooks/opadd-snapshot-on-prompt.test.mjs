import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
const { looksLikeOpaddPrompt, isCopiedReply } = await import("./opadd-snapshot-on-prompt.mjs");

test("matches an opadd command at the start of any line", () => {
  assert.equal(looksLikeOpaddPrompt("opadd Stripe API key"), true);
  assert.equal(looksLikeOpaddPrompt("context first\nopadd GitHub token\nmore context"), true);
  assert.equal(looksLikeOpaddPrompt("opadd\tOpenAI restricted key"), true);
});

test("ignores mentions, indentation, missing names, and different casing", () => {
  assert.equal(looksLikeOpaddPrompt("Please explain opadd"), false);
  assert.equal(looksLikeOpaddPrompt("`opadd Stripe`"), false);
  assert.equal(looksLikeOpaddPrompt(" opadd Stripe"), false);
  assert.equal(looksLikeOpaddPrompt("opadd"), false);
  assert.equal(looksLikeOpaddPrompt("Opadd Stripe"), false);
});

test("matches 1pw only at the start of the message", () => {
  assert.equal(looksLikeOpaddPrompt("1pw Stripe API key"), true);
  assert.equal(looksLikeOpaddPrompt("1pw: Stripe API key"), true);
  assert.equal(looksLikeOpaddPrompt("context first\n1pw Stripe API key"), false);
  assert.equal(looksLikeOpaddPrompt(" 1pw Stripe"), false);
  assert.equal(looksLikeOpaddPrompt("1pw"), false);
  assert.equal(looksLikeOpaddPrompt("1password agent token is failing"), false);
});

test("matches a reply that is just \"copied\"", () => {
  assert.equal(isCopiedReply("copied"), true);
  assert.equal(isCopiedReply("Copied"), true);
  assert.equal(isCopiedReply("  copied.\n"), true);
  assert.equal(isCopiedReply("copied!"), true);
  assert.equal(isCopiedReply("copied it"), false);
  assert.equal(isCopiedReply("I copied the file"), false);
  assert.equal(isCopiedReply("copied?"), false);
  assert.equal(looksLikeOpaddPrompt("copied"), false);
});
