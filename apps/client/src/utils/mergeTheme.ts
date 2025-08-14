import { Theme } from "@/types/editor";

export const mergeTheme = (prevTheme: Theme, newTheme: Partial<Theme>): Theme => {
  return {
    ...prevTheme,
    ...newTheme,
    name: newTheme?.name ?? prevTheme?.name,
  };
};
