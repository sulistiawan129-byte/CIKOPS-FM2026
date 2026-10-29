/* MOCK BACKEND — semua RPC tiruan, dikelompokkan per modul. */
import type { RpcHandler } from "../core";
import { FLEET } from "./fleet";
import { FACILITY } from "./facility";
import { FIELD } from "./field";

export const RPC: Record<string, RpcHandler> = { ...FLEET, ...FACILITY, ...FIELD };
