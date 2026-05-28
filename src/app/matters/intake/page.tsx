"use client";

import Link from "next/link";
import { type CSSProperties, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle, Plus, Save, ShieldAlert, Trash2 } from "lucide-react";
import { requestApiWithSession, SessionRequiredError } from "@/lib/api/browser-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type SaveMode = "draft" | "activate";
type InitialAction = "lawsuit" | "complaint";
type ConflictCheckStatus = "clear" | "pending";
type EngagementAgreementStatus = "signed" | "pending";
type PoaStatus = "valid" | "pending";
type IntakeWorkflowStatus = "draft" | "active" | "pending_documents";
type PartyType =
  | "natural_person"
  | "company"
  | "establishment"
  | "government_entity"
  | "ministry"
  | "public_authority"
  | "public_prosecution"
  | "police"
  | "prosecution_authority"
  | "bank"
  | "insurance_company"
  | "association"
  | "heirs"
  | "other";
type PartyCapacity =
  | "claimant"
  | "defendant"
  | "complainant"
  | "accused"
  | "respondent"
  | "beneficiary"
  | "guarantor"
  | "witness"
  | "related_party"
  | "prosecution_authority";
type ComplaintActionType =
  | "police_report"
  | "public_prosecution_complaint"
  | "cybercrime_report"
  | "labor_complaint"
  | "administrative_complaint"
  | "regulatory_complaint";

type IntakeResponse = {
  data: {
    matter: {
      id: string;
      intakeWorkflowStatus: IntakeWorkflowStatus;
    };
  };
  requestId: string;
};

type RelatedPartyForm = {
  partyName: string;
  partyType: PartyType;
  legalCapacity: PartyCapacity;
  identificationNumber: string;
  registrationNumber: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
};

type IntakeFormState = {
  clientPartyType: PartyType;
  clientNaturalFullName: string;
  clientNaturalQidOrPassport: string;
  clientNaturalNationality: string;
  clientNaturalPhone: string;
  clientNaturalEmail: string;
  clientNaturalAddress: string;
  clientOrgTradeName: string;
  clientOrgCrNumber: string;
  clientOrgAuthorizedSignatory: string;
  clientOrgSignatoryCapacity: string;
  clientOrgPhone: string;
  clientOrgEmail: string;
  clientOrgAddress: string;
  clientGovEntityName: string;
  clientGovDepartment: string;
  clientGovContactPerson: string;
  clientGovOfficialEmail: string;
  clientGovOfficialPhone: string;
  clientGovAddress: string;
  clientGenericName: string;
  relatedParties: RelatedPartyForm[];
  conflictCheckStatus: ConflictCheckStatus;
  engagementAgreementStatus: EngagementAgreementStatus;
  poaStatus: PoaStatus;
  matterTitle: string;
  matterNumber: string;
  matterDescription: string;
  initialAction: InitialAction;
  lawsuitCaseNumber: string;
  lawsuitCourtId: string;
  lawsuitCircuit: string;
  lawsuitDepartment: string;
  lawsuitClaimType: string;
  complaintActionType: ComplaintActionType;
  complaintComplainant: string;
  complaintAccusedRespondent: string;
  complaintPublicProsecution: string;
  complaintPoliceStation: string;
  complaintCybercrimeDepartment: string;
  complaintAdministrativeAuthority: string;
  complaintLaborAuthority: string;
  complaintRegulatoryAuthority: string;
  complaintReportNumber: string;
  complaintSubmissionDate: string;
  complaintNotes: string;
};

const EMPTY_RELATED_PARTY: RelatedPartyForm = {
  partyName: "",
  partyType: "natural_person",
  legalCapacity: "defendant",
  identificationNumber: "",
  registrationNumber: "",
  contactPerson: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

const INITIAL_FORM_STATE: IntakeFormState = {
  clientPartyType: "natural_person",
  clientNaturalFullName: "",
  clientNaturalQidOrPassport: "",
  clientNaturalNationality: "",
  clientNaturalPhone: "",
  clientNaturalEmail: "",
  clientNaturalAddress: "",
  clientOrgTradeName: "",
  clientOrgCrNumber: "",
  clientOrgAuthorizedSignatory: "",
  clientOrgSignatoryCapacity: "",
  clientOrgPhone: "",
  clientOrgEmail: "",
  clientOrgAddress: "",
  clientGovEntityName: "",
  clientGovDepartment: "",
  clientGovContactPerson: "",
  clientGovOfficialEmail: "",
  clientGovOfficialPhone: "",
  clientGovAddress: "",
  clientGenericName: "",
  relatedParties: [{ ...EMPTY_RELATED_PARTY }],
  conflictCheckStatus: "pending",
  engagementAgreementStatus: "pending",
  poaStatus: "pending",
  matterTitle: "",
  matterNumber: "",
  matterDescription: "",
  initialAction: "lawsuit",
  lawsuitCaseNumber: "",
  lawsuitCourtId: "",
  lawsuitCircuit: "",
  lawsuitDepartment: "",
  lawsuitClaimType: "",
  complaintActionType: "police_report",
  complaintComplainant: "",
  complaintAccusedRespondent: "",
  complaintPublicProsecution: "",
  complaintPoliceStation: "",
  complaintCybercrimeDepartment: "",
  complaintAdministrativeAuthority: "",
  complaintLaborAuthority: "",
  complaintRegulatoryAuthority: "",
  complaintReportNumber: "",
  complaintSubmissionDate: "",
  complaintNotes: "",
};

const PARTY_TYPE_LABELS: Record<PartyType, string> = {
  natural_person: "فرد",
  company: "شركة",
  establishment: "مؤسسة",
  government_entity: "جهة حكومية",
  ministry: "وزارة",
  public_authority: "هيئة أو مؤسسة عامة",
  public_prosecution: "النيابة العامة",
  police: "شرطة",
  prosecution_authority: "سلطة اتهام",
  bank: "بنك",
  insurance_company: "شركة تأمين",
  association: "جمعية",
  heirs: "ورثة",
  other: "أخرى",
};

const PARTY_CAPACITY_LABELS: Record<PartyCapacity, string> = {
  claimant: "مدعٍ",
  defendant: "مدعى عليه",
  complainant: "مشتكٍ",
  accused: "متهم",
  respondent: "مستجيب",
  beneficiary: "مستفيد",
  guarantor: "كفيل",
  witness: "شاهد",
  related_party: "طرف ذو صلة",
  prosecution_authority: "سلطة اتهام",
};

export default function MatterIntakePage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [form, setForm] = useState<IntakeFormState>(INITIAL_FORM_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastMode, setLastMode] = useState<SaveMode>("draft");
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const configurationError = !supabase ? "تعذر تحميل إعدادات الاتصال بالخدمة." : null;

  const projectedActivationStatus: IntakeWorkflowStatus = useMemo(() => (
    isRepresentationReady(form) ? "active" : "pending_documents"
  ), [form]);

  async function submit(mode: SaveMode) {
    setLastMode(mode);
    setErrorMessage(null);
    const messages = validateForm(form, mode);
    setValidationMessages(messages);
    if (messages.length > 0) return;
    if (!supabase) return;

    setIsSubmitting(true);
    try {
      const payload = await requestApiWithSession<IntakeResponse>(supabase, "/api/v1/matters/intake", {
        method: "POST",
        body: JSON.stringify({
          saveMode: mode,
          client: buildClientPayload(form),
          relatedParties: form.relatedParties.map((party) => ({
            partyName: party.partyName.trim(),
            partyType: party.partyType,
            legalCapacity: party.legalCapacity,
            identificationNumber: party.identificationNumber.trim() || undefined,
            registrationNumber: party.registrationNumber.trim() || undefined,
            contactPerson: party.contactPerson.trim() || undefined,
            phone: party.phone.trim() || undefined,
            email: party.email.trim() || undefined,
            address: party.address.trim() || undefined,
            notes: party.notes.trim() || undefined,
          })),
          conflictCheckStatus: form.conflictCheckStatus,
          engagementAgreementStatus: form.engagementAgreementStatus,
          poaStatus: form.poaStatus,
          matter: {
            title: form.matterTitle.trim(),
            matterNumber: form.matterNumber.trim() || undefined,
            description: form.matterDescription.trim() || undefined,
            status: "open",
          },
          initialAction: form.initialAction,
          lawsuit: form.initialAction === "lawsuit"
            ? {
                caseNumber: form.lawsuitCaseNumber.trim() || undefined,
                courtId: form.lawsuitCourtId.trim() || undefined,
                circuit: form.lawsuitCircuit.trim() || undefined,
                department: form.lawsuitDepartment.trim() || undefined,
                claimType: form.lawsuitClaimType.trim() || undefined,
              }
            : undefined,
          complaint: form.initialAction === "complaint"
            ? {
                actionType: form.complaintActionType,
                complainant: form.complaintComplainant.trim() || undefined,
                accusedRespondent: form.complaintAccusedRespondent.trim() || undefined,
                publicProsecution: form.complaintPublicProsecution.trim() || undefined,
                policeStation: form.complaintPoliceStation.trim() || undefined,
                cybercrimeDepartment: form.complaintCybercrimeDepartment.trim() || undefined,
                administrativeAuthority: form.complaintAdministrativeAuthority.trim() || undefined,
                laborAuthority: form.complaintLaborAuthority.trim() || undefined,
                regulatoryAuthority: form.complaintRegulatoryAuthority.trim() || undefined,
                reportNumber: form.complaintReportNumber.trim() || undefined,
                submissionDate: toIsoOrUndefined(form.complaintSubmissionDate),
                notes: form.complaintNotes.trim() || undefined,
              }
            : undefined,
        }),
      });

      router.replace(`/matters/${payload.data.matter.id}`);
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        router.replace(`/login?next=${encodeURIComponent("/matters/intake")}`);
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : "تعذر حفظ بيانات القيد.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function updateRelatedParty(index: number, patch: Partial<RelatedPartyForm>) {
    setForm((current) => ({
      ...current,
      relatedParties: current.relatedParties.map((party, partyIndex) => (
        partyIndex === index ? { ...party, ...patch } : party
      )),
    }));
  }

  function addRelatedParty() {
    setForm((current) => ({
      ...current,
      relatedParties: [...current.relatedParties, { ...EMPTY_RELATED_PARTY }],
    }));
  }

  function removeRelatedParty(index: number) {
    setForm((current) => {
      if (current.relatedParties.length <= 1) return current;
      return {
        ...current,
        relatedParties: current.relatedParties.filter((_, partyIndex) => partyIndex !== index),
      };
    });
  }

  const requiresNaturalPerson = form.clientPartyType === "natural_person";
  const requiresOrganization = ["company", "establishment", "bank", "insurance_company", "association"].includes(form.clientPartyType);
  const requiresGovernment = ["government_entity", "ministry", "public_authority", "public_prosecution", "police", "prosecution_authority"].includes(form.clientPartyType);

  return (
    <main className="app-shell">
      <div className="page-container">
        <section className="panel" style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div>
              <p className="eyebrow" style={{ margin: 0 }}>قيد ملف قانوني</p>
              <h1 style={{ margin: "8px 0 4px", fontSize: 30 }}>نموذج فتح ملف قانوني</h1>
              <p className="muted" style={{ margin: 0 }}>
                يرجى إدخال بيانات الموكل وكافة الأطراف ذات الصلة. فحص تعارض المصالح يعتمد على جميع الأطراف المدخلة.
              </p>
            </div>
            <Link className="button button-secondary" href="/matters">
              <ArrowRight size={18} />
              الرجوع إلى الملفات
            </Link>
          </div>

          <div style={statusGuideStyle}>
            <strong>الحالة المتوقعة عند التفعيل:</strong>
            <span>{statusLabel(projectedActivationStatus)}</span>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit("activate");
            }}
            style={{ display: "grid", gap: 16 }}
          >
            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>1) تصنيف الموكل وبياناته</h2>
              <label style={fieldStyle}>
                <span>نوع الموكل *</span>
                <select
                  value={form.clientPartyType}
                  onChange={(event) => {
                    const partyType = event.target.value as PartyType;
                    setForm((current) => ({ ...current, clientPartyType: partyType }));
                  }}
                  style={inputStyle}
                >
                  {Object.entries(PARTY_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              {requiresNaturalPerson ? (
                <>
                  <label style={fieldStyle}>
                    <span>الاسم الكامل *</span>
                    <input
                      value={form.clientNaturalFullName}
                      onChange={(event) => setForm((current) => ({ ...current, clientNaturalFullName: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>رقم الهوية القطرية / الجواز</span>
                    <input
                      value={form.clientNaturalQidOrPassport}
                      onChange={(event) => setForm((current) => ({ ...current, clientNaturalQidOrPassport: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>الجنسية</span>
                    <input
                      value={form.clientNaturalNationality}
                      onChange={(event) => setForm((current) => ({ ...current, clientNaturalNationality: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>رقم الجوال</span>
                    <input
                      value={form.clientNaturalPhone}
                      onChange={(event) => setForm((current) => ({ ...current, clientNaturalPhone: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>البريد الإلكتروني</span>
                    <input
                      type="email"
                      value={form.clientNaturalEmail}
                      onChange={(event) => setForm((current) => ({ ...current, clientNaturalEmail: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                    <span>العنوان</span>
                    <textarea
                      rows={3}
                      value={form.clientNaturalAddress}
                      onChange={(event) => setForm((current) => ({ ...current, clientNaturalAddress: event.target.value }))}
                      style={{ ...inputStyle, resize: "vertical", minHeight: 84, padding: "10px 12px" }}
                    />
                  </label>
                </>
              ) : null}

              {requiresOrganization ? (
                <>
                  <label style={fieldStyle}>
                    <span>الاسم التجاري *</span>
                    <input
                      value={form.clientOrgTradeName}
                      onChange={(event) => setForm((current) => ({ ...current, clientOrgTradeName: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>رقم السجل التجاري</span>
                    <input
                      value={form.clientOrgCrNumber}
                      onChange={(event) => setForm((current) => ({ ...current, clientOrgCrNumber: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>المفوّض بالتوقيع</span>
                    <input
                      value={form.clientOrgAuthorizedSignatory}
                      onChange={(event) => setForm((current) => ({ ...current, clientOrgAuthorizedSignatory: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>صفة المفوّض</span>
                    <input
                      value={form.clientOrgSignatoryCapacity}
                      onChange={(event) => setForm((current) => ({ ...current, clientOrgSignatoryCapacity: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>رقم الجوال</span>
                    <input
                      value={form.clientOrgPhone}
                      onChange={(event) => setForm((current) => ({ ...current, clientOrgPhone: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>البريد الإلكتروني</span>
                    <input
                      type="email"
                      value={form.clientOrgEmail}
                      onChange={(event) => setForm((current) => ({ ...current, clientOrgEmail: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                    <span>العنوان</span>
                    <textarea
                      rows={3}
                      value={form.clientOrgAddress}
                      onChange={(event) => setForm((current) => ({ ...current, clientOrgAddress: event.target.value }))}
                      style={{ ...inputStyle, resize: "vertical", minHeight: 84, padding: "10px 12px" }}
                    />
                  </label>
                </>
              ) : null}

              {requiresGovernment ? (
                <>
                  <label style={fieldStyle}>
                    <span>اسم الجهة *</span>
                    <input
                      value={form.clientGovEntityName}
                      onChange={(event) => setForm((current) => ({ ...current, clientGovEntityName: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>الإدارة / القسم</span>
                    <input
                      value={form.clientGovDepartment}
                      onChange={(event) => setForm((current) => ({ ...current, clientGovDepartment: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>الممثل / موظف الاتصال</span>
                    <input
                      value={form.clientGovContactPerson}
                      onChange={(event) => setForm((current) => ({ ...current, clientGovContactPerson: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>البريد الرسمي</span>
                    <input
                      type="email"
                      value={form.clientGovOfficialEmail}
                      onChange={(event) => setForm((current) => ({ ...current, clientGovOfficialEmail: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>الهاتف الرسمي</span>
                    <input
                      value={form.clientGovOfficialPhone}
                      onChange={(event) => setForm((current) => ({ ...current, clientGovOfficialPhone: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                    <span>العنوان</span>
                    <textarea
                      rows={3}
                      value={form.clientGovAddress}
                      onChange={(event) => setForm((current) => ({ ...current, clientGovAddress: event.target.value }))}
                      style={{ ...inputStyle, resize: "vertical", minHeight: 84, padding: "10px 12px" }}
                    />
                  </label>
                </>
              ) : null}

              {!requiresNaturalPerson && !requiresOrganization && !requiresGovernment ? (
                <label style={fieldStyle}>
                  <span>اسم الجهة / الطرف *</span>
                  <input
                    value={form.clientGenericName}
                    onChange={(event) => setForm((current) => ({ ...current, clientGenericName: event.target.value }))}
                    style={inputStyle}
                  />
                </label>
              ) : null}
            </section>

            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>2) الأطراف الخصوم وذوو الصلة</h2>
              <p className="muted" style={{ gridColumn: "1 / -1", margin: 0 }}>
                أدخل جميع الأطراف المحتمل ارتباطهم بالنزاع. دقة فحص تعارض المصالح تعتمد على اكتمال هذه القائمة.
              </p>

              {form.relatedParties.map((party, index) => (
                <div key={`related-party-${index}`} style={partyCardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <strong>طرف رقم {index + 1}</strong>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => removeRelatedParty(index)}
                      disabled={form.relatedParties.length <= 1}
                    >
                      <Trash2 size={16} />
                      حذف
                    </button>
                  </div>

                  <label style={fieldStyle}>
                    <span>اسم الطرف *</span>
                    <input
                      value={party.partyName}
                      onChange={(event) => updateRelatedParty(index, { partyName: event.target.value })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>نوع الطرف *</span>
                    <select
                      value={party.partyType}
                      onChange={(event) => updateRelatedParty(index, { partyType: event.target.value as PartyType })}
                      style={inputStyle}
                    >
                      {Object.entries(PARTY_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label style={fieldStyle}>
                    <span>الصفة القانونية *</span>
                    <select
                      value={party.legalCapacity}
                      onChange={(event) => updateRelatedParty(index, { legalCapacity: event.target.value as PartyCapacity })}
                      style={inputStyle}
                    >
                      {Object.entries(PARTY_CAPACITY_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label style={fieldStyle}>
                    <span>رقم هوية / جواز</span>
                    <input
                      value={party.identificationNumber}
                      onChange={(event) => updateRelatedParty(index, { identificationNumber: event.target.value })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>رقم السجل / التسجيل</span>
                    <input
                      value={party.registrationNumber}
                      onChange={(event) => updateRelatedParty(index, { registrationNumber: event.target.value })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>الممثل / نقطة الاتصال</span>
                    <input
                      value={party.contactPerson}
                      onChange={(event) => updateRelatedParty(index, { contactPerson: event.target.value })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>رقم الجوال</span>
                    <input
                      value={party.phone}
                      onChange={(event) => updateRelatedParty(index, { phone: event.target.value })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>البريد الإلكتروني</span>
                    <input
                      type="email"
                      value={party.email}
                      onChange={(event) => updateRelatedParty(index, { email: event.target.value })}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                    <span>العنوان</span>
                    <textarea
                      rows={2}
                      value={party.address}
                      onChange={(event) => updateRelatedParty(index, { address: event.target.value })}
                      style={{ ...inputStyle, resize: "vertical", minHeight: 74, padding: "10px 12px" }}
                    />
                  </label>
                  <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                    <span>ملاحظات</span>
                    <textarea
                      rows={2}
                      value={party.notes}
                      onChange={(event) => updateRelatedParty(index, { notes: event.target.value })}
                      style={{ ...inputStyle, resize: "vertical", minHeight: 74, padding: "10px 12px" }}
                    />
                  </label>
                </div>
              ))}

              <button type="button" className="button button-secondary" onClick={addRelatedParty} style={{ width: "fit-content" }}>
                <Plus size={16} />
                إضافة طرف آخر
              </button>
            </section>

            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>3) متطلبات مباشرة التمثيل</h2>
              <label style={fieldStyle}>
                <span>نتيجة فحص تعارض المصالح *</span>
                <select
                  value={form.conflictCheckStatus}
                  onChange={(event) => setForm((current) => ({ ...current, conflictCheckStatus: event.target.value as ConflictCheckStatus }))}
                  style={inputStyle}
                >
                  <option value="pending">قيد الفحص</option>
                  <option value="clear">سليم</option>
                </select>
              </label>
              <label style={fieldStyle}>
                <span>اتفاقية الأتعاب *</span>
                <select
                  value={form.engagementAgreementStatus}
                  onChange={(event) => setForm((current) => ({ ...current, engagementAgreementStatus: event.target.value as EngagementAgreementStatus }))}
                  style={inputStyle}
                >
                  <option value="pending">غير موقعة</option>
                  <option value="signed">موقعة</option>
                </select>
              </label>
              <label style={fieldStyle}>
                <span>سند الوكالة *</span>
                <select
                  value={form.poaStatus}
                  onChange={(event) => setForm((current) => ({ ...current, poaStatus: event.target.value as PoaStatus }))}
                  style={inputStyle}
                >
                  <option value="pending">غير مكتمل</option>
                  <option value="valid">ساري/صحيح</option>
                </select>
              </label>
            </section>

            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>4) بيانات الملف القانوني</h2>
              <label style={fieldStyle}>
                <span>موضوع الملف *</span>
                <input
                  value={form.matterTitle}
                  onChange={(event) => setForm((current) => ({ ...current, matterTitle: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={fieldStyle}>
                <span>رقم الملف</span>
                <input
                  value={form.matterNumber}
                  onChange={(event) => setForm((current) => ({ ...current, matterNumber: event.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                <span>ملخص الوقائع</span>
                <textarea
                  rows={3}
                  value={form.matterDescription}
                  onChange={(event) => setForm((current) => ({ ...current, matterDescription: event.target.value }))}
                  style={{ ...inputStyle, resize: "vertical", minHeight: 84, padding: "10px 12px" }}
                />
              </label>
            </section>

            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>5) الإجراء الافتتاحي</h2>
              <label style={fieldStyle}>
                <span>نوع الإجراء *</span>
                <select
                  value={form.initialAction}
                  onChange={(event) => setForm((current) => ({ ...current, initialAction: event.target.value as InitialAction }))}
                  style={inputStyle}
                >
                  <option value="lawsuit">دعوى</option>
                  <option value="complaint">بلاغ / شكوى</option>
                </select>
              </label>

              {form.initialAction === "lawsuit" ? (
                <>
                  <label style={fieldStyle}>
                    <span>رقم الدعوى</span>
                    <input
                      value={form.lawsuitCaseNumber}
                      onChange={(event) => setForm((current) => ({ ...current, lawsuitCaseNumber: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>معرّف المحكمة (UUID)</span>
                    <input
                      value={form.lawsuitCourtId}
                      onChange={(event) => setForm((current) => ({ ...current, lawsuitCourtId: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>الدائرة</span>
                    <input
                      value={form.lawsuitCircuit}
                      onChange={(event) => setForm((current) => ({ ...current, lawsuitCircuit: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>القسم</span>
                    <input
                      value={form.lawsuitDepartment}
                      onChange={(event) => setForm((current) => ({ ...current, lawsuitDepartment: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>نوع المطالبة</span>
                    <input
                      value={form.lawsuitClaimType}
                      onChange={(event) => setForm((current) => ({ ...current, lawsuitClaimType: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label style={fieldStyle}>
                    <span>تصنيف الشكوى / البلاغ *</span>
                    <select
                      value={form.complaintActionType}
                      onChange={(event) => setForm((current) => ({ ...current, complaintActionType: event.target.value as ComplaintActionType }))}
                      style={inputStyle}
                    >
                      <option value="police_report">بلاغ لدى الشرطة</option>
                      <option value="public_prosecution_complaint">شكوى لدى النيابة العامة</option>
                      <option value="cybercrime_report">بلاغ جرائم إلكترونية</option>
                      <option value="labor_complaint">شكوى عمالية</option>
                      <option value="administrative_complaint">شكوى إدارية</option>
                      <option value="regulatory_complaint">شكوى تنظيمية</option>
                    </select>
                  </label>
                  <label style={fieldStyle}>
                    <span>المشتكي</span>
                    <input
                      value={form.complaintComplainant}
                      onChange={(event) => setForm((current) => ({ ...current, complaintComplainant: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>المتهم / المشكو في حقه</span>
                    <input
                      value={form.complaintAccusedRespondent}
                      onChange={(event) => setForm((current) => ({ ...current, complaintAccusedRespondent: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>النيابة العامة</span>
                    <input
                      value={form.complaintPublicProsecution}
                      onChange={(event) => setForm((current) => ({ ...current, complaintPublicProsecution: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>مركز الشرطة</span>
                    <input
                      value={form.complaintPoliceStation}
                      onChange={(event) => setForm((current) => ({ ...current, complaintPoliceStation: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>إدارة الجرائم الإلكترونية</span>
                    <input
                      value={form.complaintCybercrimeDepartment}
                      onChange={(event) => setForm((current) => ({ ...current, complaintCybercrimeDepartment: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>الجهة الإدارية</span>
                    <input
                      value={form.complaintAdministrativeAuthority}
                      onChange={(event) => setForm((current) => ({ ...current, complaintAdministrativeAuthority: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>الجهة العمالية</span>
                    <input
                      value={form.complaintLaborAuthority}
                      onChange={(event) => setForm((current) => ({ ...current, complaintLaborAuthority: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>الجهة التنظيمية</span>
                    <input
                      value={form.complaintRegulatoryAuthority}
                      onChange={(event) => setForm((current) => ({ ...current, complaintRegulatoryAuthority: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>رقم البلاغ / الشكوى</span>
                    <input
                      value={form.complaintReportNumber}
                      onChange={(event) => setForm((current) => ({ ...current, complaintReportNumber: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span>تاريخ التقديم</span>
                    <input
                      type="datetime-local"
                      value={form.complaintSubmissionDate}
                      onChange={(event) => setForm((current) => ({ ...current, complaintSubmissionDate: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
                    <span>ملاحظات البلاغ</span>
                    <textarea
                      rows={3}
                      value={form.complaintNotes}
                      onChange={(event) => setForm((current) => ({ ...current, complaintNotes: event.target.value }))}
                      style={{ ...inputStyle, resize: "vertical", minHeight: 84, padding: "10px 12px" }}
                    />
                  </label>
                </>
              )}
            </section>

            {validationMessages.length > 0 ? (
              <div role="alert" style={validationBoxStyle}>
                <strong>يرجى استكمال النقاط التالية:</strong>
                <ul style={{ margin: "6px 0 0", paddingInlineStart: 18 }}>
                  {validationMessages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {configurationError || errorMessage ? (
              <p role="alert" style={{ color: "#b42318", margin: 0, display: "flex", gap: 8, alignItems: "center" }}>
                <ShieldAlert size={16} />
                {configurationError ?? errorMessage}
              </p>
            ) : null}

            <div className="actions" style={{ marginTop: 0 }}>
              <button
                type="button"
                className="button button-secondary"
                disabled={isSubmitting || !!configurationError}
                onClick={() => void submit("draft")}
              >
                {isSubmitting && lastMode === "draft" ? <LoaderCircle size={18} className="animate-spin" /> : <Save size={18} />}
                {isSubmitting && lastMode === "draft" ? "جارٍ حفظ المسودة..." : "حفظ كمسودة"}
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={isSubmitting || !!configurationError}
              >
                {isSubmitting && lastMode === "activate" ? <LoaderCircle size={18} className="animate-spin" /> : <Save size={18} />}
                {isSubmitting && lastMode === "activate" ? "جارٍ حفظ وتفعيل الملف..." : "حفظ وتفعيل الملف"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

const sectionStyle: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: 12,
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  background: "rgba(255, 255, 255, 0.72)",
};

const sectionTitleStyle: CSSProperties = {
  gridColumn: "1 / -1",
  margin: 0,
  fontSize: 18,
};

const partyCardStyle: CSSProperties = {
  gridColumn: "1 / -1",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: 12,
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  background: "rgba(255,255,255,0.86)",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid var(--line)",
  borderRadius: 8,
  minHeight: 42,
  padding: "8px 12px",
  fontSize: 14,
  background: "white",
};

const statusGuideStyle: CSSProperties = {
  border: "1px dashed var(--line)",
  borderRadius: 8,
  padding: "10px 12px",
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  background: "rgba(255, 255, 255, 0.7)",
};

const validationBoxStyle: CSSProperties = {
  border: "1px solid #f9b5b5",
  background: "#fff7f7",
  borderRadius: 8,
  padding: "10px 12px",
  color: "#912018",
};

function buildClientPayload(form: IntakeFormState) {
  return {
    partyType: form.clientPartyType,
    naturalPerson: form.clientPartyType === "natural_person"
      ? {
          fullName: form.clientNaturalFullName.trim(),
          qidOrPassport: form.clientNaturalQidOrPassport.trim() || undefined,
          nationality: form.clientNaturalNationality.trim() || undefined,
          phone: form.clientNaturalPhone.trim() || undefined,
          email: form.clientNaturalEmail.trim() || undefined,
          address: form.clientNaturalAddress.trim() || undefined,
        }
      : undefined,
    organization: ["company", "establishment", "bank", "insurance_company", "association"].includes(form.clientPartyType)
      ? {
          tradeName: form.clientOrgTradeName.trim(),
          commercialRegistrationNumber: form.clientOrgCrNumber.trim() || undefined,
          authorizedSignatory: form.clientOrgAuthorizedSignatory.trim() || undefined,
          signatoryCapacity: form.clientOrgSignatoryCapacity.trim() || undefined,
          phone: form.clientOrgPhone.trim() || undefined,
          email: form.clientOrgEmail.trim() || undefined,
          address: form.clientOrgAddress.trim() || undefined,
        }
      : undefined,
    governmentEntity: ["government_entity", "ministry", "public_authority", "public_prosecution", "police", "prosecution_authority"].includes(form.clientPartyType)
      ? {
          entityName: form.clientGovEntityName.trim(),
          department: form.clientGovDepartment.trim() || undefined,
          contactPerson: form.clientGovContactPerson.trim() || undefined,
          officialEmail: form.clientGovOfficialEmail.trim() || undefined,
          officialPhone: form.clientGovOfficialPhone.trim() || undefined,
          address: form.clientGovAddress.trim() || undefined,
        }
      : undefined,
    genericName: form.clientGenericName.trim() || undefined,
  };
}

function validateForm(form: IntakeFormState, mode: SaveMode) {
  const messages: string[] = [];

  if (!form.matterTitle.trim()) {
    messages.push("موضوع الملف القانوني مطلوب.");
  }

  if (form.relatedParties.length === 0) {
    messages.push("يجب إدخال طرف خصم أو طرف ذي صلة واحد على الأقل.");
  }

  form.relatedParties.forEach((party, index) => {
    if (!party.partyName.trim()) {
      messages.push(`اسم الطرف رقم ${index + 1} مطلوب.`);
    }
  });

  if (form.clientPartyType === "natural_person" && !form.clientNaturalFullName.trim()) {
    messages.push("الاسم الكامل للموكل (فرد) مطلوب.");
  }

  if (["company", "establishment", "bank", "insurance_company", "association"].includes(form.clientPartyType) && !form.clientOrgTradeName.trim()) {
    messages.push("الاسم التجاري للموكل مطلوب.");
  }

  if (["government_entity", "ministry", "public_authority", "public_prosecution", "police", "prosecution_authority"].includes(form.clientPartyType) && !form.clientGovEntityName.trim()) {
    messages.push("اسم الجهة الحكومية / الرسمية مطلوب.");
  }

  if (["heirs", "other"].includes(form.clientPartyType) && !form.clientGenericName.trim()) {
    messages.push("اسم الطرف للنوع المختار مطلوب.");
  }

  if (mode === "activate") {
    if (form.initialAction === "lawsuit" && !form.lawsuitCaseNumber.trim()) {
      messages.push("رقم الدعوى مطلوب عند تفعيل ملف يبدأ بدعوى.");
    }

    if (form.initialAction === "complaint" && !hasAnyComplaintAuthority(form)) {
      messages.push("عند تفعيل ملف يبدأ ببلاغ/شكوى يجب إدخال جهة مختصة واحدة على الأقل.");
    }

    if (form.conflictCheckStatus !== "clear") {
      messages.push("لا يمكن التفعيل قبل اعتماد فحص تعارض المصالح بحالة: سليم.");
    }

    if (form.engagementAgreementStatus !== "signed") {
      messages.push("لا يمكن التفعيل قبل توقيع اتفاقية الأتعاب.");
    }

    if (form.poaStatus !== "valid") {
      messages.push("لا يمكن التفعيل قبل اعتماد سند الوكالة بحالة: ساري/صحيح.");
    }
  }

  return messages;
}

function isRepresentationReady(form: IntakeFormState) {
  return form.conflictCheckStatus === "clear"
    && form.engagementAgreementStatus === "signed"
    && form.poaStatus === "valid";
}

function hasAnyComplaintAuthority(form: IntakeFormState) {
  return [
    form.complaintPublicProsecution,
    form.complaintPoliceStation,
    form.complaintCybercrimeDepartment,
    form.complaintAdministrativeAuthority,
    form.complaintLaborAuthority,
    form.complaintRegulatoryAuthority,
  ].some((value) => value.trim().length > 0);
}

function statusLabel(status: IntakeWorkflowStatus) {
  if (status === "active") return "نشط";
  if (status === "pending_documents") return "بانتظار استكمال المستندات";
  return "مسودة";
}

function toIsoOrUndefined(value: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}
