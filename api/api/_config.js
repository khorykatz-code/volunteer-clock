export const CFG = {
  // TABLE NAMES (change if your base uses different names)
  MEMBERS_TABLE: "Members",        // <-- set to your existing member table name
  ACTIVITIES_TABLE: "Activities",
  LOGS_TABLE: "Logs",

  // MEMBERS FIELDS (change to match your existing member table)
  MEMBER_NUMBER_FIELD: "MemberNumber",
  MEMBER_NAME_FIELD: "Name",
  MEMBER_PHONE_FIELD: "PhoneE164",

  // ACTIVITIES FIELDS
  ACTIVITY_NAME_FIELD: "Name",
  ACTIVITY_MODE_FIELD: "Mode",                 // "Shift" or "Attendance"
  ACTIVITY_AUTOCLOSE_MIN_FIELD: "AutoCloseMinutes",

  // LOGS FIELDS
  LOG_ID_FIELD: "LogID",                       // your primary field
  LOG_MEMBER_LINK_FIELD: "Member",             // link to Members
  LOG_ACTIVITY_LINK_FIELD: "Activity",         // link to Activities
  LOG_START_FIELD: "Start",
  LOG_END_FIELD: "End",
  LOG_REMINDER_SENT_FIELD: "ReminderSentAt",
  LOG_CLOCKOUT_TOKEN_FIELD: "ClockOutToken",
  LOG_CLOCKOUT_TOKEN_EXPIRES_FIELD: "ClockOutTokenExpires",

  // BEHAVIOR
  REMIND_AFTER_MINUTES: 120, // 2 hours
  TOKEN_EXPIRES_DAYS: 7
};
