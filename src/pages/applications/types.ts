export interface Application {
  name: string;
  package_name: string;
  version: string | undefined;
  size: number | undefined;
  source: 'apt' | 'snap' | 'flatpak';
}

export interface ApplicationDetails {
  name: string;
  package_name: string;
  version: string | undefined;
  size: number | undefined;
  source: 'apt' | 'snap' | 'flatpak';
  desktop_file: string | undefined;
  desktop_content: string | undefined;
  description: string | undefined;
  icon: string | undefined;
  categories: string[] | undefined;
  exec: string | undefined;
}
