export interface RegistrationData {
  revoNames: {
    name: string;
    owner: `0x${string}`;
    expiryDateWithGrace: string;
    resolver: {
      address: `0x${string}`;
    };
  };
  registration: {
    registrationDate: string;
    expiryDate: string;
  };
  nameRegistereds: {
    transactionID: `0x${string}`;
  }[];
}
