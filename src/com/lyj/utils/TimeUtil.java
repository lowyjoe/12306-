package com.lyj.utils;

import java.sql.Timestamp;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;


public class TimeUtil {
	
	 
 
	/**
	 * 日期转换为字符串
	 * 
	 * @param date
	 *            日期
	 * @param format
	 *            日期格式  yyyy-MM-dd HH:mm:ss
	 * @return 字符串
	 */
	public static String getFormatedDate(String format) {
		
		SimpleDateFormat sdf = new SimpleDateFormat(format);
		return sdf.format(new Date());
	}
	
	/**
	 * 获得当前时间是一年的第几周
	 * @param calendar
	 * @return
	 */
	public static int getWeekOfYear(Calendar calendar){
		return calendar.get(Calendar.WEEK_OF_YEAR);
	}
	
	/**
	 * date2Calendar
	 * @param date
	 * @return
	 */
	public static Calendar date2Calendar(Date date){
		Calendar calendar = Calendar.getInstance();
		calendar.setTime(date);
		
		return calendar;
	}
	
	/**
	 * 获得当前年月
	 * @return
	 */
	public static String curYearMonth(){
		SimpleDateFormat strFormater = new SimpleDateFormat("yyyyMM");
		Calendar lastDate = Calendar.getInstance();
		return "_"+strFormater.format(lastDate.getTime());
	}
	
	
	/**
	 * 获得当前年月日
	 * @return
	 */
	public static String curYearMonthDay(){
		SimpleDateFormat strFormater = new SimpleDateFormat("yyyyMMdd");
		Calendar lastDate = Calendar.getInstance();
		return "_"+strFormater.format(lastDate.getTime());
	}
	
	
	/**
	 * 获得当前年
	 * @return
	 */
	public static String curYear(){
		SimpleDateFormat strFormater = new SimpleDateFormat("yyyy");
		Calendar lastDate = Calendar.getInstance();
		return "_"+strFormater.format(lastDate.getTime());
	}
	
	
	/**
	 * 获得下一个年月
	 * @return
	 */
	public static String nextYearMonth(){
		SimpleDateFormat strFormater = new SimpleDateFormat("yyyyMM");
		Calendar lastDate = Calendar.getInstance();
		lastDate.add(Calendar.MONTH,1);
		return "_"+strFormater.format(lastDate.getTime());
	}
	
	/**
	 * 获得下一个年
	 * @return
	 */
	public static String nextYear(){
		SimpleDateFormat strFormater = new SimpleDateFormat("yyyy");
		Calendar lastDate = Calendar.getInstance();
		lastDate.add(Calendar.YEAR,1);
		return "_"+strFormater.format(lastDate.getTime());
	}
	
	/**
	 * 获得下一天
	 * @return
	 */
	public static String nextYearMonthDay(){
		SimpleDateFormat strFormater = new SimpleDateFormat("yyyyMMdd");
		Calendar lastDate = Calendar.getInstance();
		lastDate.add(Calendar.DAY_OF_MONTH,1);
		return "_"+strFormater.format(lastDate.getTime());
	}
	
	/**
	 * 获得下一个年月
	 * @return
	 */
	public static Date nextTimeMinute(int amount){
		Calendar time = Calendar.getInstance();
		time.add(Calendar.MINUTE,amount);
		return time.getTime();
	}
	
	/**
	 * 获取今天在本年的第几天
	 * @return
	 */
	public static int getDayOfYear() {
		return Calendar.getInstance().get(Calendar.DAY_OF_YEAR);
	}
	
	/**
	 * 今天是否是一年的第一天
	 * @return
	 */
	public static boolean firstDayOfYear(){
		return Calendar.getInstance().get(Calendar.DAY_OF_YEAR) == 1 ? true : false;
	}
	
	/**
	 * 获取今天在本月的第几天
	 * @return
	 */
	public static int getDayOfMonth() {
		return Calendar.getInstance().get(Calendar.DAY_OF_MONTH);
	}
	
	/**
	 * 今天是否是一月的第一天
	 * @return
	 */
	public static boolean firstDayOfMonth(){
		return Calendar.getInstance().get(Calendar.DAY_OF_MONTH) == 1 ? true : false;
	}
	
	   
	
	/**
	 * 获得当天给定日期的时间偏移
	 * @category (type = {Calendar.HOUR,Calendar.DATE,Calendar.MONTH})
	 * @param
	 * @return
	 */
	public static Date getDateOffset(Date date, int offset, int type){
		Calendar c = Calendar.getInstance();
		c.setTime(date);
		
		if(type == Calendar.HOUR)
			c.add(Calendar.HOUR , offset) ;
		if(type == Calendar.DATE)
			c.add(Calendar.DATE , offset) ;
		if(type == Calendar.MONTH)
			c.add(Calendar.MONTH , offset) ;
		return c.getTime();
	}

	
	public static String getDayString(int days,String fmt ){
		Calendar c = Calendar.getInstance();
		c.setTime(new Date());
		c.add(Calendar.DATE, days);
		c.set(Calendar.HOUR_OF_DAY, 0);
		c.set(Calendar.MINUTE, 0);
		c.set(Calendar.SECOND, 0);
		return  date2Str(c.getTime(),fmt);
	}
	
	 
	/**
	 * 获得指定日期的00:00:00
	 * @param dateformat
	 * @return
	 */
	public static Date getFirstTimeOfDay(Date date){
		if(date==null){
			return null;
		}
		Calendar c = Calendar.getInstance();
		c.setTime(date);
		c.set(Calendar.HOUR_OF_DAY, 0);
		c.set(Calendar.MINUTE, 0);
		c.set(Calendar.SECOND, 0);
		return  c.getTime();
	}
	
	/**
	 * 获得指定日期的08:00:00
	 * @param dateformat
	 * @return
	 */
	public static Date getFirstTimeOfHour(Date date){
		if(date==null){
			return null;
		}
		Calendar c = Calendar.getInstance();
		c.setTime(date);
		c.set(Calendar.MINUTE, 0);
		c.set(Calendar.SECOND, 0);
		return  c.getTime();
	}
	
	/**
	 * 获得指定日期的00:00:00
	 * @param dateformat
	 * @return
	 */
	public static Date getFirstTimeOfMonth(){
		Calendar c = Calendar.getInstance();
		c.set(Calendar.DAY_OF_MONTH, 1);
		c.set(Calendar.HOUR_OF_DAY, 0);
		c.set(Calendar.MINUTE, 0);
		c.set(Calendar.SECOND, 0);
		return  c.getTime();
	}
	
	public static Date getFirstTimeOfMonth(Date date){
		Calendar c = Calendar.getInstance();
		c.setTime(date);
		c.set(Calendar.DAY_OF_MONTH, 1);
		c.set(Calendar.HOUR_OF_DAY, 0);
		c.set(Calendar.MINUTE, 0);
		c.set(Calendar.SECOND, 0);
		return  c.getTime();
	}
	
	/**
	 * 获得指定日期的00:00:00
	 * @param dateformat
	 * @return
	 */
	public static Date getFirstTimeOfDay(){
		Calendar c = Calendar.getInstance();
		c.set(Calendar.HOUR_OF_DAY, 0);
		c.set(Calendar.MINUTE, 0);
		c.set(Calendar.SECOND, 0);
		return  c.getTime();
	}
	
	
	/**
	 * 获得指定日期的23:59:59
	 * @param dateformat
	 * @return
	 */
	public static Date getLastTimeOfDay(Date date){
		if(date==null){
			return null;
		}
		Calendar c = Calendar.getInstance();
		c.setTime(date);
		c.set(Calendar.HOUR_OF_DAY, 23);
		c.set(Calendar.MINUTE, 59);
		c.set(Calendar.SECOND, 59);
		return  c.getTime();
	}
	/**
	 * 获得指定日期的23:59:59
	 * @param dateformat
	 * @return
	 */
	public static String getLastTimeOfDay(int days){
		
		Calendar c = Calendar.getInstance();
		c.setTime(new Date());
		c.add(Calendar.DATE, days);
		c.set(Calendar.HOUR_OF_DAY, 23);
		c.set(Calendar.MINUTE, 59);
		c.set(Calendar.SECOND, 59);
		return  date2Str(c.getTime());
	}
	/**
	 * 获得指定日期的23:59:59
	 * @param dateformat
	 * @return
	 */
	public static String getFirstTimeOfDay(int days){
		
		Calendar c = Calendar.getInstance();
		c.setTime(new Date());
		c.add(Calendar.DATE, days);
		c.set(Calendar.HOUR_OF_DAY, 0);
		c.set(Calendar.MINUTE, 0);
		c.set(Calendar.SECOND, 0);
		return  date2Str(c.getTime());
	}
	
	
	public static Date getDayOffset(int days){
		Calendar c = Calendar.getInstance();
		c.setTime(new Date());
		c.add(Calendar.DATE, days);
		return  c.getTime();
	}
	
	/**
	 * 获得昨天00:0:00
	 * @return
	 */
	public static Calendar getYesterdayCalendar(){
		
		Calendar calendar = Calendar.getInstance();
		calendar.add(Calendar.DATE, -1);
		calendar.set(Calendar.HOUR_OF_DAY,0);//设为当前时间为0    
		calendar.set(Calendar.MINUTE,0);//设为当前分钟为0
		calendar.set(Calendar.SECOND,0);//设为当前秒为0 
		
		return calendar;
	}
	
	/**
	 * 获得距离calendar的某天
	 * @param calendar 日期
	 * @param amount 相差天数
	 * @param hourOfDay 小时
	 * @param minute 分钟
	 * @param second 秒
	 * @return
	 */
	public static Calendar getSomedayCalendar(Calendar calendar, int amount, int hourOfDay, int minute, int second){
		calendar.add(Calendar.DATE, amount);
		calendar.set(Calendar.HOUR_OF_DAY,hourOfDay);//设为当前时间为0    
		calendar.set(Calendar.MINUTE,minute);//设为当前分钟为0
		calendar.set(Calendar.SECOND,second);//设为当前秒为0 
		
		return calendar;
	}
	
	/**
	 * 日期转换为字符串
	 * 
	 * @param date
	 *            日期
	 * @param format
	 *            日期格式
	 * @return 字符串
	 */
	public static String date2Str(Date date, String format) {
		if (null == date) {
			return null;
		}
		SimpleDateFormat sdf = new SimpleDateFormat(format);
		return sdf.format(date);
	}
	/**
	 * 日期转换为字符串
	 * 
	 * @param date
	 *            日期
	 * @param format
	 *            日期格式
	 * @return 字符串
	 */
	public static String date2Str(Date date) {
		if (null == date) {
			return null;
		}
		SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
		return sdf.format(date);
	}
	
	/**
	 * 字符串转换成日期 如果转换格式为空，则利用默认格式进行转换操作
	 * 
	 * @param str
	 *            字符串
	 * @param format
	 *            日期格式
	 * @return 日期
	 * @throws java.text.ParseException
	 */
	public static Date str2Date(String str, String format) {
		if (null == str || "".equals(str)) {
			return null;
		}
		// 如果没有指定字符串转换的格式，则用默认格式进行转换
		if (null == format || "".equals(format)) {
			format = "yyyy-MM-dd HH:mm:ss";
		}
		SimpleDateFormat sdf = new SimpleDateFormat(format);
		Date date = null;
		try {
			date = sdf.parse(str);
			return date;
		} catch (ParseException e) {
			e.printStackTrace();
		}
		return null;
	}
	
	/**
	 * 字符串转换时间戳
	 * 
	 * @param str
	 * @return
	 */
	public static Timestamp str2Timestamp(String str) {
		Date date = str2Date(str, "yyyy-MM-dd HH:mm:ss");
		return new Timestamp(date.getTime());
	}

	public static String getTimesConvert(long beginTime, long endTime){
		long between = endTime - beginTime;  
		long day = between / (24 * 60 * 60 * 1000);
        long hour = (between / (60 * 60 * 1000) - day * 24);
        long min = ((between / (60 * 1000)) - day * 24 * 60 - hour * 60);
        long s = (between / 1000 - day * 24 * 60 * 60 - hour * 60 * 60 - min * 60);
        long ms = (between - day * 24 * 60 * 60 * 1000 - hour * 60 * 60 * 1000
                - min * 60 * 1000 - s * 1000);
        if(day != 0){
        	return day + "天" + hour + "小时" + min + "分" + s + "秒" + ms + "毫秒";
        }else if(hour != 0){
        	return hour + "小时" + min + "分" + s + "秒" + ms + "毫秒";
        }else if(min != 0){
        	return min + "分" + s + "秒" + ms + "毫秒";
        }else if(s != 0){
        	return s + "秒" + ms + "毫秒";
        }else {
        	return ms + "毫秒";
        }
//        String result = day + "天" + hour + "小时" + min + "分" + s + "秒" + ms + "毫秒";
	}
	
	
	public static int getDate4int(Date date){
		return Integer.parseInt(date2Str(date,"yyyyMMdd"));
	}
	public static int getDateH4int(Date date){
		return Integer.parseInt(date2Str(date,"yyyyMMddHH"));
	}
	public static SimpleDateFormat strFormater = new SimpleDateFormat("yyyyMMdd");
	public static int getDate4int(int i){
		Calendar lastDate = Calendar.getInstance();
		lastDate.add(Calendar.DAY_OF_MONTH,i);
		return Integer.parseInt(strFormater.format(lastDate.getTime()));
	}
	public static String getDate4String(int i){
		Calendar lastDate = Calendar.getInstance();
		lastDate.add(Calendar.DAY_OF_MONTH,i);
		return strFormater.format(lastDate.getTime());
	}
	
	public static String getDate4String(int i, String format) {
		Calendar lastDate = Calendar.getInstance();
		lastDate.add(Calendar.DAY_OF_MONTH, i);
		SimpleDateFormat sdf = new SimpleDateFormat(format);
		return sdf.format(lastDate.getTime());
	}
	
	

	public static Date getTodayTime() {
		Calendar d = Calendar.getInstance();
		d.set(Calendar.HOUR_OF_DAY,0);//设为当前时间为0    
		d.set(Calendar.MINUTE,0);//设为当前分钟为0
		d.set(Calendar.SECOND,0);//设为当前秒为0
		return d.getTime();
	}

	public static void main(String[] args) {
		System.out.println(getFirstTimeOfMonth());
	}
}
