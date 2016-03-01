/**
 * eversec.com.cn Inc.
 * Copyright (c) 2010-2014 All Rights Reserved.
 */
package com.lyj.utils;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.UnsupportedEncodingException;

import org.apache.commons.lang.StringUtils;
import org.jsoup.Connection.Response;

/**
 * 文件操作工具类
 * 
 * @author liuyijiao
 * @version
 */
public class FileUtil {


    /**
     * 将xml数据保存到文件中
     * 
     * @param file
     * @param xmlString
     */
    public static void saveFile(File file, InputStream in) {

        if (file == null || in == null) {
            return;
        }

        BufferedOutputStream bos = null;
        BufferedInputStream bis = null;
        try {
            bos = new BufferedOutputStream(new FileOutputStream(file));
            bis = new BufferedInputStream(in);

            byte[] b = new byte[4096];
            int n = 0;
            while ((n = bis.read(b)) != -1) {
                bos.write(b, 0, n);
            }

            bos.flush();
        } catch (FileNotFoundException e) {
            System.out.println("文件路径不存在：" + file.getPath() + file.getName()+ e);
        } catch (IOException e) {
            System.out.println("写xml文件异常！"+ e);
        } finally {
            close(bis, bos);
        }
    }

    /**
     * 将xml数据保存到文件中 
     * 
     * @param file
     * @param xmlString
     * @param ifAppend  是否追加到文件中 
     */
    public static void saveFile(File file, String xmlString,boolean  ifAppend) {

        if (file == null || StringUtils.isBlank(xmlString)) {
            return;
        }

        BufferedOutputStream bos = null;
        BufferedInputStream bis = null;
        try {
            bos = new BufferedOutputStream(new FileOutputStream(file,ifAppend));
            bis = new BufferedInputStream(new ByteArrayInputStream(xmlString.getBytes()));

            byte[] b = new byte[4096];
            int n = 0;
            while ((n = bis.read(b)) != -1) {
                bos.write(b, 0, n);
            }

            bos.flush();
        } catch (FileNotFoundException e) {
            System.out.println("文件路径不存在：" + file.getPath() + file.getName()+ e);
        } catch (IOException e) {
            System.out.println("写xml文件异常！"+e);
        } finally {
            close(bis, bos);
        }
    }

    /**
     * 读取文件内容
     * 
     * @param file
     * @return
     */
    public static byte[] readFileToBinary(File file) {

        BufferedInputStream bis = null;

        ByteArrayOutputStream bos = new ByteArrayOutputStream();

        try {
            bis = new BufferedInputStream(new FileInputStream(file));

            byte[] b = new byte[4096];
            int n = -1;
            while ((n = bis.read(b)) != -1) {
                bos.write(b, 0, n);
            }

        } catch (Exception e) {
            System.out.println("读取文件异常！"+ e);
        } finally {
             close(bis, bos);
        }
        return bos.toByteArray();
    }

    public static String readFile(File file){
    	String xmlContent="";
    	InputStreamReader isr = null ;
    	BufferedReader bufferedReader=null;
		try {
			//File file=new File("C:\\Users\\liuyijiao\\Desktop\\192.168.10.198_20150720141215.xml");
			isr = new InputStreamReader(new FileInputStream(file), "UTF-8"); 
			bufferedReader=new BufferedReader(isr);
			String line=null;
			StringBuffer sb=new StringBuffer();
			while((line=bufferedReader.readLine())!=null){
				sb.append(line);
				sb.append("\n");
			}
			xmlContent=sb.toString();
		} catch (UnsupportedEncodingException e) {
			e.printStackTrace();
		} catch (FileNotFoundException e) {
			e.printStackTrace();
		} catch (IOException e) {
			e.printStackTrace();
		}finally{
			try {
				isr.close();
				bufferedReader.close();
			} catch (IOException e) {
				e.printStackTrace();
			}
		}
		return  xmlContent;
	
    }
    //保存图片  12306验证图片使用
    public static void saveImg(String picDir,String fileName,Response response) throws Exception {  
        String filePath = picDir+"\\"+fileName ;  
        BufferedOutputStream out = null;  
        byte[] bit = response.bodyAsBytes();  
        if (bit.length > 0) {  
            try {  
                out = new BufferedOutputStream(new FileOutputStream(filePath));  
                out.write(bit);  
                out.flush();  
                System.out.println("Create File success! [" + filePath + "]");  
            } finally {  
                if (out != null)  
                    out.close();  
            }  
        }  
    }  
    public static void close(InputStream in, OutputStream out) {

        try {
            if (in != null) {
                in.close();
            }

            if (out != null) {
                out.close();
            }
        } catch (IOException e) {
            System.out.println("关闭流异常！"+e);
        }

    }
}
