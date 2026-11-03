import "server-only";

import { cache } from "react";
import geographyRows from "../../../public/thailand-geography.json";

type GeographyRow = {
  districtCode: number;
  districtNameTh: string;
  postalCode: number;
  provinceCode: number;
  provinceNameTh: string;
  subdistrictCode: number;
  subdistrictNameTh: string;
};

export type GeographyOption = {
  code: number;
  label: string;
  postalCode?: number;
};

type GeographyDataset = {
  districtsByProvince: Map<number, GeographyOption[]>;
  provinces: GeographyOption[];
  subdistrictsByDistrict: Map<string, GeographyOption[]>;
};

function sortOptions(options: GeographyOption[]) {
  return options.toSorted((left, right) => left.label.localeCompare(right.label, "th"));
}

export const getGeographyDataset = cache((): GeographyDataset => {
  const rows = geographyRows as GeographyRow[];
  const provinces = new Map<number, GeographyOption>();
  const districtsByProvince = new Map<number, Map<number, GeographyOption>>();
  const subdistrictsByDistrict = new Map<string, Map<number, GeographyOption>>();

  for (const row of rows) {
    provinces.set(row.provinceCode, {
      code: row.provinceCode,
      label: row.provinceNameTh,
    });

    const districtMap = districtsByProvince.get(row.provinceCode) ?? new Map<number, GeographyOption>();
    districtMap.set(row.districtCode, {
      code: row.districtCode,
      label: row.districtNameTh,
    });
    districtsByProvince.set(row.provinceCode, districtMap);

    const subdistrictKey = `${row.provinceCode}:${row.districtCode}`;
    const subdistrictMap =
      subdistrictsByDistrict.get(subdistrictKey) ?? new Map<number, GeographyOption>();
    subdistrictMap.set(row.subdistrictCode, {
      code: row.subdistrictCode,
      label: row.subdistrictNameTh,
      postalCode: row.postalCode,
    });
    subdistrictsByDistrict.set(subdistrictKey, subdistrictMap);
  }

  return {
    districtsByProvince: new Map(
      Array.from(districtsByProvince.entries()).map(([provinceCode, districtMap]) => [
        provinceCode,
        sortOptions(Array.from(districtMap.values())),
      ]),
    ),
    provinces: sortOptions(Array.from(provinces.values())),
    subdistrictsByDistrict: new Map(
      Array.from(subdistrictsByDistrict.entries()).map(([key, subdistrictMap]) => [
        key,
        sortOptions(Array.from(subdistrictMap.values())),
      ]),
    ),
  };
});

export function getProvinceOptions() {
  return getGeographyDataset().provinces;
}

export function getDistrictOptions(provinceCode: number) {
  return getGeographyDataset().districtsByProvince.get(provinceCode) ?? [];
}

export function getSubdistrictOptions(provinceCode: number, districtCode: number) {
  return getGeographyDataset().subdistrictsByDistrict.get(`${provinceCode}:${districtCode}`) ?? [];
}
