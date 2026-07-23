export type EomReport = {
  name: string;
  period: string;
  range: string;
  generated: string;
};

export const MOCK_EOM_REPORTS: EomReport[] = [
  { name: "EOM_Report_Jul_2026.pdf", period: "July 2026",  range: "Jul 1 – Jul 31, 2026", generated: "Aug 01, 2026" },
  { name: "EOM_Report_Jun_2026.pdf", period: "June 2026",  range: "Jun 1 – Jun 30, 2026", generated: "Jul 01, 2026" },
];
