import { databaseBinding } from "./cloudflare";
import { D1Store } from "./d1Store";
export function d1Store(): D1Store { return new D1Store(databaseBinding()); }
