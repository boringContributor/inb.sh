import { customAlphabet } from "nanoid";

const hex = customAlphabet("0123456789abcdef", 12);
const alnum = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);

/** `8f2a-9c41-7e3d` — unguessable enough to be the capture URL itself */
export const endpointSlug = () => hex().replace(/(.{4})(.{4})(.{4})/, "$1-$2-$3");
export const requestId = () => `req_${hex()}`;
export const ruleId = () => `rule_${alnum()}`;
export const integrationId = () => `int_${alnum()}`;
export const endpointId = () => `ep_${alnum()}`;
export const deliveryId = () => `dlv_${alnum()}${alnum()}`;
export const workspaceId = () => `ws_${alnum()}${alnum()}`;
