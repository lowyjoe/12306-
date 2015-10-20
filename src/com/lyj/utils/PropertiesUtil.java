package com.lyj.utils;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Properties;


public class PropertiesUtil {
	/**
	 * 
	* @Title: getValueByKey
	* @Description: 得到properties文件中的指定键的值
	* @param @param propertiesFile 文件名称
	* @param @param key 键
	* @param @return    value
	* @return String    String
	* @author liuyijiao
	* @date 2015-10-19 下午02:58:36
	* @version V1.0
	* @throws
	 */
	public static String getValueByKey(String propertiesFile, String key){
		String res = null;
		try{
			InputStream is = PropertiesUtil.class.getClassLoader().getResourceAsStream(propertiesFile);
			Properties p = new Properties();
			p.load(is);
			is.close();
			res = p.getProperty(key);
		}
		catch(Exception err){
			err.printStackTrace();
		}
		return res;
	}
	/**
	 * 
	* @Title: setValueByKey
	* @Description: 设置properties文件 中属性的值  如果文件不存在  则新建文件  将属性添加到文件中
	* @param @param propertiesFile  文件名称
	* @param @param key 属性键
	* @param @param value 属性值
	* @author liuyijiao
	* @date 2015-10-19 下午02:50:42
	* @version V1.0
	* @throws
	 */
	public static void setValueByKey(String propertiesFile, String key, String value){
		//String res = null;
		try{
			String newFilePath = PropertiesUtil.class.getResource("/").getPath();
			File file = new File(newFilePath); 
			file = new File(newFilePath + propertiesFile);
			if (!file.exists()){ 
				file.createNewFile();
			} 
			InputStream fis = new FileInputStream(file); 
			Properties prop = new Properties();
			prop.load(fis); 
			fis.close(); 

			prop.setProperty(key, value); 
			OutputStream fos = new FileOutputStream(file.getPath()); 
			prop.store(fos, null); 
			fos.close();
		}
		catch(Exception err){
			err.printStackTrace();
		}
		
		//return res;
	}
	public static void main(String[] args) {
		System.out.println(getValueByKey("jdbc.properties","jdbc.password"));
		//setValueByKey("jdbc.properties","jdbc.password","ceshi");
		System.out.println(getValueByKey("jdbc.properties","jdbc.password"));
	}
}
