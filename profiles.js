import { parseFwyArrivalNotice } from "./parsers/fwy.js";
import "./parsers/contract.js";

export const profiles = [
  {
    id: "fwy",
    name: "FWY",
    dropHint: "FWY arrival notice — pallets",
    defaults: {
      supplierId: "SEAW83300",
      supplierReference: "SEAW260910",
      stockType: "FFA",
    },
    parsePdf: parseFwyArrivalNotice,
  },
];

export function getProfile(id) {
  return profiles.find((profile) => profile.id === id) || profiles[0];
}
