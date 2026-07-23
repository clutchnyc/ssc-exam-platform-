// Host-aware track split: the one app serves two front doors.
//   exam.sakestudiescenter.com    → professional exam portal
//   courses.sakestudiescenter.com → consumer video course storefront
// Anything else (ssc-exams.netlify.app, localhost) shows the combined
// view, so nothing changes for dev/testing until the DNS records exist.

const APEX = "sakestudiescenter.com";

export function siteMode() {
  const h = window.location.hostname;
  if (h === `courses.${APEX}`) return "courses";
  if (h === `exam.${APEX}`) return "exam";
  return "combined";
}

/** Origin for professional-track links (class invites). */
export function examOrigin() {
  return window.location.hostname.endsWith(APEX)
    ? `https://exam.${APEX}`
    : window.location.origin;
}

/** Origin for consumer-track links (sales/enroll pages). */
export function coursesOrigin() {
  return window.location.hostname.endsWith(APEX)
    ? `https://courses.${APEX}`
    : window.location.origin;
}
