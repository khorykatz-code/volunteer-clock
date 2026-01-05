export const CFG = {
  // TABLE NAMES
  MEMBERS_TABLE: "MASTER MEMBERSHIP",
  ACTIVITIES_TABLE: "Work Hour Events and Categories",
  LOGS_TABLE: "Work Hour Log 2 (2026+)",

  // MEMBERS FIELDS
  MEMBER_NUMBER_FIELD: "Member #",
  MEMBER_NAME_FIELD: "Full Name",
  MEMBER_PHONE_FIELD: "Phone Number",

  // ACTIVITIES FIELDS
  ACTIVITY_NAME_FIELD: "Name",
  ACTIVITY_MODE_FIELD: "Mode",                 // make sure your Activities table has this exact field name
  ACTIVITY_AUTOCLOSE_MIN_FIELD: "AutoCloseMinutes", // make sure your Activities table has this exact field name

  // LOGS FIELDS
  LOG_ID_FIELD: "LogID",                       // make sure your Logs primary field is exactly LogID
  LOG_MEMBER_LINK_FIELD: "Member",             // make sure Logs has a linked field to MASTER MEMBERSHIP named exactly "Member"
  LOG_ACTIVITY_LINK_FIELD: "Activity",         // make sure Logs links to Activities with field named exactly "Activity"
  LOG_START_FIELD: "Start",
  LOG_END_FIELD: "End",
  LOG_REMINDER_SENT_FIELD: "ReminderSentAt",
  LOG_CLOCKOUT_TOKEN_FIELD: "ClockOutToken",
  LOG_CLOCKOUT_TOKEN_EXPIRES_FIELD: "ClockOutTokenExpires",

  // BEHAVIOR
  REMIND_AFTER_MINUTES: 120, // 2 hours
  TOKEN_EXPIRES_DAYS: 7
};
