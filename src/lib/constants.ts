export const DEFAULT_LOCALE = "ar-QA";
export const DEFAULT_CURRENCY = "QAR";
export const DEFAULT_PHONE_COUNTRY_CODE = "+974";

export const QATAR_COURTS = [
  { code: "appeal", nameAr: "محكمة الاستئناف", nameEn: "Court of Appeal" },
  { code: "primary-dafna", nameAr: "المحكمة الابتدائية - الدفنة", nameEn: "Primary Court - Dafna" },
  { code: "primary-al-sadd", nameAr: "المحكمة الابتدائية - السد", nameEn: "Primary Court - Al Sadd" },
  { code: "primary-lusail", nameAr: "المحكمة الابتدائية - لوسيل", nameEn: "Primary Court - Lusail" },
  { code: "labor", nameAr: "المحكمة العمالية", nameEn: "Labor Court" },
  { code: "commercial", nameAr: "المحكمة التجارية", nameEn: "Commercial Court" },
  { code: "cassation", nameAr: "محكمة التمييز", nameEn: "Court of Cassation" },
  { code: "family", nameAr: "محكمة الأسرة", nameEn: "Family Court" },
  { code: "investment-trade", nameAr: "محكمة الاستثمار والتجارة", nameEn: "Investment and Trade Court" },
  { code: "rental", nameAr: "لجنة فض المنازعات الإيجارية", nameEn: "Rental Dispute Resolution Committee" },
] as const;

export const QATAR_PROSECUTIONS = [
  { code: "public-prosecution", nameAr: "النيابة العامة", nameEn: "Public Prosecution" },
  { code: "economic-crimes", nameAr: "إدارة مكافحة الجرائم الاقتصادية", nameEn: "Economic Crimes Department" },
  { code: "family-prosecution", nameAr: "نيابة الأسرة", nameEn: "Family Prosecution" },
  { code: "traffic-prosecution", nameAr: "نيابة المرور", nameEn: "Traffic Prosecution" },
] as const;

export const ROLE_NAMES = ["owner", "admin", "lawyer", "staff", "client", "system"] as const;
