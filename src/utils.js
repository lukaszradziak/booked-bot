export const getNextWeekDay = (day = 1) => {
  const date = new Date();
  date.setDate(date.getDate() + (7-date.getDay())%7+ day);
  return date.toISOString().split('T')[0];
}
