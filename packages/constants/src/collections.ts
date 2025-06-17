export interface Collection {
  id: string;
  name: string;
  description: string;
  themeCount: number;
  themes: any[];
  isServer?: boolean;
  categoryImage?: {
    id: number;
    url: string | null;
    [key: string]: any;
  } | null;
}
