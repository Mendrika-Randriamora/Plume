export interface Application {
  name: string;
  package_name: string;
  version: string | null;
  size: number | null;
  source: 'apt' | 'snap' | 'flatpak';
}

export interface ApplicationDetails {
  name: string;
  package_name: string;
  version: string | null;
  size: number | null;
  source: 'apt' | 'snap' | 'flatpak';
  desktop_file: string | null;
  desktop_content: string | null;
  description: string | null;
  icon: string | null;
  categories: string[] | null;
  exec: string | null;
}
