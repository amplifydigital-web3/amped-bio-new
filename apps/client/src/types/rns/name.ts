import { FormattedDateTime } from "@/utils/rns";

export interface NameDates {
  expiry: FormattedDateTime;
  gracePeriod: FormattedDateTime;
  registration: FormattedDateTime;
}

export interface NameDetails {
  name: string;
  ownerAddress: `0x${string}`;
  displayAddress: string;
  contractAddress: string;
  roles: string[];
  dates: NameDates;
  status: "available" | "registered";
}

export interface RevoName {
  name: string;
  labelName: string;
  expiryDateWithGrace: string;
}

export interface NameDetail {
  name: string;
  labelHash: string;
  expiryDateWithGrace: string;
  owner: string;
  registration: {
    registrationDate: string;
    expiryDate: string;
  };
  resolver: {
    address: string;
  };
}
