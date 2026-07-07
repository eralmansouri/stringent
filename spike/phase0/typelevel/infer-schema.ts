// Schema-shaped inference + validate (the parse()/schema-param path)
import type { type } from "arktype";
export type S = type.infer<{ values: { password: "string", age: "number", address: { zip: "string" } } }>;
export type V = type.validate<{ values: { password: "string", age: "number" } }>;
export type Deep = type.infer<"string.email | number.integer | boolean[]">;
