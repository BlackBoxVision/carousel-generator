import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { allowLocal, isPrivateAddress, safeFetch } from "../../mcp/lib/net.mjs";

describe("isPrivateAddress", () => {
  test("ipv4 privadas/reservadas", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "255.255.255.255",
      "224.0.0.1",
    ]) {
      assert.equal(isPrivateAddress(ip), true, `${ip} should be private`);
    }
  });

  test("ipv4 publicas", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "100.63.0.1"]) {
      assert.equal(isPrivateAddress(ip), false, `${ip} should be public`);
    }
  });

  test("ipv6 privadas y mapped", () => {
    assert.equal(isPrivateAddress("::1"), true);
    assert.equal(isPrivateAddress("::"), true);
    assert.equal(isPrivateAddress("fe80::1"), true);
    assert.equal(isPrivateAddress("fd00::1"), true);
    assert.equal(isPrivateAddress("::ffff:192.168.0.1"), true);
    assert.equal(isPrivateAddress("2606:4700:4700::1111"), false);
  });
});

describe("safeFetch guardas SSRF", () => {
  test("rechaza protocolos no http(s)", async () => {
    await assert.rejects(() => safeFetch("file:///etc/passwd"), /Protocolo no permitido/);
    await assert.rejects(() => safeFetch("ftp://example.com/x"), /Protocolo no permitido/);
  });

  test("rechaza URLs invalidas", async () => {
    await assert.rejects(() => safeFetch("not a url"), /URL inválida/);
  });

  test("bloquea loopback y metadata por IP literal (sin red)", async () => {
    await assert.rejects(() => safeFetch("http://127.0.0.1:9/x"), /bloqueada/);
    await assert.rejects(() => safeFetch("http://169.254.169.254/latest/meta-data/"), /bloqueada/);
    await assert.rejects(() => safeFetch("http://10.1.2.3/x"), /bloqueada/);
  });

  test("bloquea hostname local", async () => {
    await assert.rejects(() => safeFetch("http://localhost:9/x"), /bloqueada/);
    await assert.rejects(() => safeFetch("http://foo.local/x"), /bloqueada/);
  });

  test("bypass por env", () => {
    const prev = process.env.CAROUSEL_GENERATOR_ALLOW_LOCAL;
    try {
      delete process.env.CAROUSEL_GENERATOR_ALLOW_LOCAL;
      assert.equal(allowLocal(), false);
      process.env.CAROUSEL_GENERATOR_ALLOW_LOCAL = "1";
      assert.equal(allowLocal(), true);
    } finally {
      if (prev === undefined) delete process.env.CAROUSEL_GENERATOR_ALLOW_LOCAL;
      else process.env.CAROUSEL_GENERATOR_ALLOW_LOCAL = prev;
    }
  });
});
