import { NextResponse } from "next/server";
import {
  getDistrictOptions,
  getProvinceOptions,
  getSubdistrictOptions,
} from "@/lib/settings/geography";

function parseCode(value: string | null) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

const GEO_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const level = searchParams.get("level");

  if (level === "provinces") {
    return NextResponse.json({ options: getProvinceOptions() }, { headers: GEO_CACHE_HEADERS });
  }

  if (level === "districts") {
    const provinceCode = parseCode(searchParams.get("provinceCode"));

    if (provinceCode === null) {
      return NextResponse.json({ message: "Missing provinceCode." }, { status: 400 });
    }

    return NextResponse.json(
      { options: getDistrictOptions(provinceCode) },
      { headers: GEO_CACHE_HEADERS },
    );
  }

  if (level === "subdistricts") {
    const provinceCode = parseCode(searchParams.get("provinceCode"));
    const districtCode = parseCode(searchParams.get("districtCode"));

    if (provinceCode === null || districtCode === null) {
      return NextResponse.json(
        { message: "Missing provinceCode or districtCode." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { options: getSubdistrictOptions(provinceCode, districtCode) },
      { headers: GEO_CACHE_HEADERS },
    );
  }

  return NextResponse.json({ message: "Unsupported geography level." }, { status: 400 });
}
