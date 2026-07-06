// Phase 0 spike: verify the runtime arktype APIs the v2 design depends on.
import { type, scope, match } from "arktype";
// Findings baked in: match object cases need the fluent .case() API (object
// literals are not string-embeddable as case keys); unsatisfiable
// intersections THROW at Type construction rather than reducing to never.

const results = [];
const check = (name, fn) => {
  try {
    const value = fn();
    results.push({ name, ok: true, value });
  } catch (e) {
    results.push({ name, ok: false, value: e.message.slice(0, 120) });
  }
};

// --- D15: set operations drive constraint matching -------------------------
check("extends: number ⊆ number|string", () =>
  type("number").extends("number | string"));
check("extends: number|string ⊄ number", () =>
  type("number | string").extends("number"));
check("extends: 'active' literal ⊆ string", () =>
  type("'active'").extends("string"));
check("extends: refined ⊆ base (number>0 ⊆ number)", () =>
  type("number > 0").extends("number"));
check("extends: base ⊄ refined (number ⊄ number>0)", () =>
  type("number").extends("number > 0"));
check("ifExtends returns Type or undefined", () => {
  const t = type("number").ifExtends("number | string");
  return [t !== undefined, type("boolean").ifExtends("number | string") === undefined];
});
check("overlaps: string|number vs number|boolean", () =>
  type("string | number").overlaps("number | boolean"));
check("overlaps: string vs number (disjoint)", () =>
  type("string").overlaps("number"));
check("unsatisfiable intersection throws at construction", () => {
  try { type("number & string"); return "no throw (unexpected)"; }
  catch (e) { return e.message.slice(0, 60); }
});
check("equals for memoization", () =>
  type("number|string").equals("string | number"));

// --- D11: schema = scope/Type; resolution via get/keyof --------------------
check("get: nested path resolution", () => {
  const schema = type({ values: { address: { zip: "string" } } });
  return schema.get("values", "address", "zip").expression;
});
check("keyof: legal identifier set", () => {
  const schema = type({ age: "number", name: "string" });
  return schema.keyof().expression;
});
check("scope spread composition", () => {
  const base = scope({ Money: "number" }).export();
  const s = scope({ ...base, Wallet: { balance: "Money" } }).export();
  return s.Wallet({ balance: 5 }) instanceof type.errors === false;
});
check("keyword library in constraints (string.email)", () =>
  type("string.email").allows("a@b.co"));
check("onUndeclaredKey reject (strict mode)", () => {
  const t = type({ age: "number", "+": "reject" });
  return t({ age: 1, extra: true }) instanceof type.errors;
});

// --- D14: match for correlated polymorphic eval ----------------------------
check("match: correlated object cases (fluent .case API)", () => {
  const evalAdd = match
    .case({ acc: "string", append: "string" }, b => b.acc + b.append)
    .case({ acc: "number", append: "number" }, b => b.acc + b.append)
    .default("assert");
  const a = evalAdd({ acc: "a", append: "b" });
  const b = evalAdd({ acc: 1, append: 2 });
  let mixedRejected = false;
  try { evalAdd({ acc: 1, append: "b" }); } catch { mixedRejected = true; }
  return [a, b, { mixedRejected }];
});

// --- D12: rule-as-Type (morph + narrow with path) ---------------------------
check("narrow with ctx.reject({path}) attributes field", () => {
  const rule = type({ password: "string", confirmPassword: "string" }).narrow(
    (d, ctx) => d.password === d.confirmPassword
      ? true
      : ctx.reject({ expected: "identical to password", actual: "", path: ["confirmPassword"] })
  );
  const out = rule({ password: "a", confirmPassword: "b" });
  return out instanceof type.errors ? out.flatProblemsByPath : "unexpected pass";
});
check("pipe: expression-as-morph composes", () => {
  const compiled = type({ age: "number" }).pipe(v => v.age >= 18);
  return [compiled({ age: 20 }), compiled({ age: 10 })];
});
check("in/out introspection of a morph", () => {
  const compiled = type({ age: "number" }).pipe(v => v.age >= 18);
  return compiled.in.expression;
});
check("toJsonSchema on rule input", () => {
  const compiled = type({ age: "number" }).pipe(v => v.age >= 18);
  return JSON.stringify(compiled.in.toJsonSchema());
});

// --- perf sanity: compile-once + dispatch cost ------------------------------
check("bench: extends() on cached Types (1e5 calls)", () => {
  const a = type("number"), b = type("number | string");
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 1e5; i++) a.extends(b);
  return `${Number(process.hrtime.bigint() - t0) / 1e5} ns/op`;
});
check("bench: match dispatch (1e5 calls)", () => {
  const m = match
    .case({ acc: "string", append: "string" }, b => b.acc + b.append)
    .case({ acc: "number", append: "number" }, b => b.acc + b.append)
    .default("assert");
  const input = { acc: 1, append: 2 };
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 1e5; i++) m(input);
  return `${Number(process.hrtime.bigint() - t0) / 1e5} ns/op`;
});
check("bench: Type instantiation cost (100 compiles)", () => {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 100; i++) type.raw(`number | string | 'k${i}'`);
  return `${Number(process.hrtime.bigint() - t0) / 100 / 1e6} ms/compile`;
});

for (const r of results)
  console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}: ${JSON.stringify(r.value)}`);

check("bench: memoized extends (1e5 calls)", () => {
  const cache = new Map();
  const a = type("number"), b = type("number | string");
  const key = a.expression + "\x00" + b.expression;
  cache.set(key, a.extends(b));
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 1e5; i++) {
    const k = a.expression + "\x00" + b.expression;
    if (!cache.has(k)) cache.set(k, a.extends(b));
    cache.get(k);
  }
  return `${Number(process.hrtime.bigint() - t0) / 1e5} ns/op`;
});
check("bench: allows() hot path (1e5 calls)", () => {
  const b = type("number | string");
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 1e5; i++) b.allows(5);
  return `${Number(process.hrtime.bigint() - t0) / 1e5} ns/op`;
});
