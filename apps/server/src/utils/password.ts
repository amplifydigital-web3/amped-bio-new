import bcrypt from "bcrypt";

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const verifyPassword = async ({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};
