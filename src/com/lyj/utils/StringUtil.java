package com.lyj.utils;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class StringUtil {

	/**
	 * 自动判断首字符是否是大写，若为大写，则将首字母改为小写
	 */
	public static String convertInitial(String str){
		char[] chars=new char[1];
		chars[0]=str.charAt(0);
		String temp=new String(chars);
		if(chars[0]>='A' && chars[0]<='Z'){
			return str.replaceFirst(temp,temp.toLowerCase());
		}else{
			return str;
		}
	}
	
	/**
	 * 将驼峰式字符串，转为下划线分割字符串
	 */
	public static String convertStr(String str){
		StringBuilder sb = new StringBuilder();
		if(str != null && str.length() > 0){
			for (int i=0; i<str.length(); i++) {
				char a = str.charAt(i);
				if(i>0 && str.charAt(i-1)!='_'  && a>='A' && a<='Z'){
					sb.append("_"+a);
				}else{
					sb.append(a);
				}
			}
		}
		return sb.toString().toLowerCase();
	}
	
	/**
	 * 自动判断首字符是否是大写，若为小写，则将首字母改为大写
	 */
	public static String convertInitialUper(String str){
		if(str != null && !str.equals("")){
			char[] chars=new char[1];
			chars[0]=str.charAt(0);
			String temp=new String(chars);
			if(chars[0]>='a' && chars[0]<='z'){
				return str.replaceFirst(temp,temp.toUpperCase());
			}else{
				return str;
			}
		}
		return str;
	}
	
	 
	public static boolean isMobileNO(String mobiles){       
        Pattern p = Pattern.compile("^1[3|4|5|6|7|8][0-9]\\d{8}$");       
        Matcher m = p.matcher(mobiles);       
        return m.matches();       
    }  
	

	
	public static void main(String[] args) {
		String str = "adminAcount";
		System.out.println(StringUtil.convertStr(str));
//		String[] a = new String[]{"1",null};
//		System.out.println(toArrayString(a,"sssss"));
	}
}
