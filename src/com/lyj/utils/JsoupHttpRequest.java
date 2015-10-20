package com.lyj.utils;

/*import org.apache.commons.lang3.StringUtils;
import org.apache.http.HttpStatus;*/
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.security.SecureRandom;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.HashMap;
import java.util.Map;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSession;
import javax.net.ssl.X509TrustManager;

import org.jsoup.Connection;
import org.jsoup.Connection.Response;
import org.jsoup.Jsoup;
 
/**
 * Created by Jane on 2015/9/10.
 */
public class JsoupHttpRequest {
 
    public static void main(String[] args) throws Exception {
       // String url = "http://localhost:8080/fileUpload";
    	String url="http://www.baidu.com";
    	// String url = "https://kyfw.12306.cn/otn/leftTicket/query?leftTicketDTO.train_date=2015-10-19&leftTicketDTO.from_station=SJP&leftTicketDTO.to_station=BJP&purpose_codes=ADULT";
       /* Map<String, String> dataMap = new HashMap<String, String>();
        dataMap.put("userName", "admin");
        dataMap.put("md5", "12cd76nskju98zud7fda0f6c9wa54");*/
        Map<String,String> dataMap=new HashMap<String,String>();
        dataMap.put("aa", "ddd");  
        Response response = doPostFileRequest(url, dataMap);
        System.out.println(response.statusMessage());
        System.out.println(response.body());
        System.out.println(response.contentType());
    }
 
    /**
     * @param url              请求的Url
     * @param paramMap         参数
     * @param file             文件
     * @param fileRequestParam form表单对应的文件name属性名
     * @return
     * @throws Exception
     */
    public static Response doPostFileRequest(String url, Map<String, String> paramMap) throws Exception {
        if (org.jsoup.helper.StringUtil.isBlank(url)) {
            throw new Exception("The request URL is blank.");
        }
        // Https请求
        if (url.startsWith("https")) {
            trustEveryone();
        }
        Connection connection = Jsoup.connect(url);
        connection.method(Connection.Method.POST);
        connection.timeout(12000);
       // connection.header("Content-Type", "multipart/form-data");
       // connection.ignoreHttpErrors(true);
        connection.ignoreContentType(true);//Set to true to force a parse attempt regardless of content type.
        if (paramMap != null && !paramMap.isEmpty()) {//设置参数
            connection.data(paramMap);
        }
        try {
            Response response = connection.execute();
            //if (response.statusCode() != HttpStatus.SC_OK) {
            if (response.statusCode() != 200) {
                throw new Exception("http请求响应码:" + response.statusCode() + "");
            }
            return response;
        } catch (IOException e) {
            e.printStackTrace();
        }
        return null;
    }
 
    /**
     * @param url              请求的Url
     * @param paramMap         参数
     * @param file             文件
     * @param fileRequestParam form表单对应的文件name属性名
     * @return
     * @throws Exception
     */
    public static Response doGetFileRequest(String url, Map<String, String> paramMap, File file, String fileRequestParam) throws Exception {
    	if (org.jsoup.helper.StringUtil.isBlank(url)) {
    		throw new Exception("The request URL is blank.");
    	}
    	// Https请求
    	if (url.startsWith("https")) {
    		trustEveryone();
    	}
    	/*Map<String,String> cookieMap=new HashMap<String,String>();
		cookieMap.put("BIGipServerotn", "1943601418.24610.0000");  
		cookieMap.put("JSESSIONID", "0A01D973607BAF2255B7E0DBC04749C026D5B4C358");
		Document doc = Jsoup.connect("https://kyfw.12306.cn/otn/leftTicket/query?leftTicketDTO.train_date=2015-10-19&leftTicketDTO.from_station=SJP&leftTicketDTO.to_station=BJP&purpose_codes=ADULT").userAgent("Mozilla/5.0 (Windows NT 6.1; WOW64; rv:40.0) Gecko/20100101 Firefox/40.0")
					.cookies(cookieMap).ignoreContentType(true).timeout(10000) .get();    
		System.out.println(doc.toString());*/
    	 Connection connection = Jsoup.connect(url);
    	connection.method(Connection.Method.GET);
    	connection.timeout(12000);
    	//connection.header("Content-Type", "application/json;charset=UTF-8");
    	connection.ignoreHttpErrors(true);
    	connection.ignoreContentType(true);
    	if (paramMap != null && !paramMap.isEmpty()) {
    		connection.data(paramMap);
    	}
    	try {
    		FileInputStream fis = new FileInputStream(file);
    		 connection.data(fileRequestParam, file.getName(), fis);
    	} catch (FileNotFoundException e) {
    		e.printStackTrace();
    	}
    	try {
    		Response response = connection.execute();
    		//if (response.statusCode() != HttpStatus.SC_OK) {
    		if (response.statusCode() != 200) {
    			throw new Exception("http请求响应码:" + response.statusCode() + "");
    		}
    		return response;
    	} catch (IOException e) {
    		e.printStackTrace();
    	} 
    	return null;
    }
    
    /**
     * 解决Https请求,返回404错误
     */
    private static void trustEveryone() {
        try {
            HttpsURLConnection.setDefaultHostnameVerifier(new HostnameVerifier() {
 
                public boolean verify(String hostname, SSLSession session) {
                    return true;
                }
            });
            SSLContext context = SSLContext.getInstance("TLS");
            context.init(null, new X509TrustManager[]{new X509TrustManager() {
 
                public void checkClientTrusted(X509Certificate[] chain, String authType) throws CertificateException {
                }
 
                public void checkServerTrusted(X509Certificate[] chain, String authType) throws CertificateException {
                }
 
                public X509Certificate[] getAcceptedIssuers() {
                    return new X509Certificate[0];
                }
            }}, new SecureRandom());
            HttpsURLConnection.setDefaultSSLSocketFactory(context.getSocketFactory());
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
