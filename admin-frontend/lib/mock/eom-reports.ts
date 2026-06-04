export type EomReport = {
  name: string;
  period: string;
  range: string;
  generated: string;
};

export const MOCK_EOM_REPORTS: EomReport[] = [
  { name: "EOM_Report_Oct_2023.pdf", period: "October 2023",   range: "Oct 1 – Oct 31, 2023", generated: "Nov 01, 2023" },
  { name: "EOM_Report_Sep_2023.pdf", period: "September 2023", range: "Sep 1 – Sep 30, 2023", generated: "Oct 01, 2023" },
  { name: "EOM_Report_Aug_2023.pdf", period: "August 2023",    range: "Aug 1 – Aug 31, 2023", generated: "Sep 01, 2023" },
  { name: "EOM_Report_Jul_2023.pdf", period: "July 2023",      range: "Jul 1 – Jul 31, 2023", generated: "Aug 01, 2023" },
  { name: "EOM_Report_Jun_2023.pdf", period: "June 2023",      range: "Jun 1 – Jun 30, 2023", generated: "Jul 01, 2023" },
  { name: "EOM_Report_May_2023.pdf", period: "May 2023",       range: "May 1 – May 31, 2023", generated: "Jun 01, 2023" },
];
