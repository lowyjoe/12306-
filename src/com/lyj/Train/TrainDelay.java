package com.lyj.Train;

import java.io.File;
import java.net.URLEncoder;
import java.security.SecureRandom;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSession;
import javax.net.ssl.X509TrustManager;

import net.sf.json.JSONArray;
import net.sf.json.JSONObject;

import org.jsoup.Connection.Method;
import org.jsoup.Connection.Response;
import org.jsoup.Jsoup;

import com.lyj.utils.FileUtil;
import com.lyj.utils.PropertiesUtil;
import com.lyj.utils.TimeUtil;

public class TrainDelay {
	//得到验证码  https://kyfw.12306.cn/otn/passcodeNew/getPassCodeNew?module=login&rand=sjrand&Math.random()//0.4916742767672986
	//验证码检测
//https://kyfw.12306.cn/otn/passcodeNew/checkRandCodeAnsyn
//randCode:252,40
//	rand:sjrand
	/**
	 * @throws Exception 
	 * @throws IOException 
	 * @Title: main
	 * @Description: TODO(这里用一句话描述这个方法的作用)
	 * @param @param args    设定文件
	 * @return void    返回类型
	 * @author liuyijiao
	 * @date 2015-9-10 下午06:07:40
	 * @version V1.0
	 * @throws
	 */
	public static void main(String[] args) throws Exception {
		/*Response res  = Jsoup.connect("https://192.168.200.114:8443/EverLog").ignoreContentType(true).timeout(10000).method(Method.POST).execute();
		System.out.println(res.body());*/
		//queryTicket("2016-03-22","SJP","BJP");//测试  火车票信息
		/*FileUtil.saveFile(new File("C:\\Users\\liuyijiao\\Desktop\\testaa.txt"), "这是测试1",true);
		FileUtil.saveFile(new File("C:\\Users\\liuyijiao\\Desktop\\testaa.txt"), "\n这是测试2\nddd",false);*/
		getPassCodeNew();
		
		//checkRandCodeAnsyn("254,47,190,107");
	}
	//验证 验证码是否正确
	private static void checkRandCodeAnsyn(String randCode) throws Exception{
    	 String url="https://kyfw.12306.cn/otn/passcodeNew/checkRandCodeAnsyn";
		 if (org.jsoup.helper.StringUtil.isBlank(url)) {
	            throw new Exception("The request URL is blank.");
	     }
		if(url.startsWith("https")){
			trustEveryone();
		}
		//post  方法 
		String keys= PropertiesUtil.getValueByKey("12306Login.properties", "cookieMapKeys");
		String values= PropertiesUtil.getValueByKey("12306Login.properties", "cookieMapVals");
		System.out.println(keys);
		System.out.println(values);
		Map<String,String> cookieMap=values2Map(keys,values);
		Response response = Jsoup.connect(url).data("randCode",randCode,"rand","sjrand").cookies(cookieMap).header("Connection", "keep-alive").userAgent("Mozilla/5.0 (Windows NT 6.1; WOW64; rv:40.0) Gecko/20100101 Firefox/40.0").ignoreContentType(true).timeout(10000).method(Method.POST).execute();
		System.out.println(response.body());
	}
	//得到验证码
	private static void getPassCodeNew() throws Exception{
   	 String url="https://kyfw.12306.cn/otn/passcodeNew/getPassCodeNew?module=login&rand=sjrand&"+Math.random();
		 if (org.jsoup.helper.StringUtil.isBlank(url)) {
	            throw new Exception("The request URL is blank.");
	     }
		if(url.startsWith("https")){
			trustEveryone();
		}
		//get  方法 
		Response response = Jsoup.connect(url).header("Connection", "keep-alive").userAgent("Mozilla/5.0 (Windows NT 6.1; WOW64; rv:40.0) Gecko/20100101 Firefox/40.0").ignoreContentType(true).timeout(10000).method(Method.GET).execute();
		System.out.println("图片");
		Map<String,String> cookieMap=response.cookies();
		PropertiesUtil.setValueByKey("12306Login.properties", "cookieMapKeys",cookieMap.keySet().toString().replace("[", "").replace("]", ""));
		PropertiesUtil.setValueByKey("12306Login.properties", "cookieMapVals",cookieMap.values().toString().replace("[", "").replace("]", ""));
		FileUtil.saveImg("C:\\Users\\liuyijiao\\Desktop","12306img.jpg",response);
	}
	 /**
	  * 
	 * @Title: queryTicket
	 * @Description: TODO(这里用一句话描述这个方法的作用)
	 * @param @param date  查询日期 （2015-12-23）
	 * @param @param fromStation  出发车站  SJP(石家庄)
	 * @param @param toStation    到达车站 BJP(北京)
	 * @param @throws Exception    设定文件
	 * @return void    返回类型
	 * @author liuyijiao
	* @date 2015-10-19 下午05:52:35
	 * @version V1.0
	 * @throws
	  */
	private  static  void queryTicket(String  date,String fromStation,String toStation) throws Exception{
		String url="https://kyfw.12306.cn/otn/leftTicket/queryT";
		Response res= trainQuery(url,date,fromStation,toStation);
		/* 实体: queryLeftNewDTO 
		 车次：station_train_code
		 始发车站： start_station_name  终点站：end_station_name
		 从车站： from_station_name  到车站：to_station_name
		 开车时间：start_time      到达时间：arrive_time    历时：lishi
		 车号：train_no 实发车站：from_station_telecode  终点站：to_station_telecode 日期：depart_date*/
		JSONObject jsonObject=JSONObject.fromObject(res.body());
		JSONArray jsonArray= jsonObject.getJSONArray("data");
		StringBuffer sb=new StringBuffer();
		for(int i=0;i<jsonArray.size();i++){
			JSONObject one= jsonArray.getJSONObject(i).getJSONObject("queryLeftNewDTO");
			String stationTrainCode=one.getString("station_train_code");//车次
			String startStationName=one.getString("start_station_name");// 始发车站
			String endStationName =one.getString("end_station_name");//终点站
			String fromStationName =one.getString("from_station_name");//从车站
			String toStationName  =one.getString("to_station_name");//到车站
			String startTime   =one.getString("start_time");//开车时间
			String arriveTime    =one.getString("arrive_time");// 到达时间
			String lishi   =one.getString("lishi");//历时
			String trainNo    =one.getString("train_no");//车号
			String fromStationTelecode   =one.getString("from_station_telecode");//实发车站
			String toStationTelecode   =one.getString("to_station_telecode");//终点站
			sb.append(stationTrainCode).append("*");
			//String departDate                       =one.getString("depart_date");//日期
			 System.out.print(stationTrainCode     );
			System.out.print(startStationName     );
			System.out.print(endStationName       );
			System.out.print(fromStationName      );
			System.out.print(toStationName        );
			System.out.print(startTime            );
			System.out.print(arriveTime           );
			System.out.print(lishi                );
			System.out.print(trainNo              );
			System.out.print(fromStationTelecode  );
			System.out.println(toStationTelecode    ); 
		}
		 //FileUtil.saveFile(new File("D:\\workspace2\\12306TrainDelayRate\\resuorces\\12306Train.txt"), sb.toString(),false);
		 FileUtil.saveFile(new File("D:\\workspace2\\12306TrainDelayRate\\resuorces\\"+fromStation+"#"+toStation+"#"+jsonArray.size()+"#"+date+".txt"), sb.toString(),false);
	}
	/**
	 * 
	* @Title: trainDelayQuery
	* @Description: 列车正晚点 查询
	* @param @param cz  车站
	* @param @param cc 车次
	* @param @param cxlx 查询类型  默认为0
	* @param @param rq 日期  默认今天
	* @param @param czEn 车站 encode编码
	* @param @param tp -----默认 new Date().getTime()
	* @param @return
	* @param @throws Exception    设定文件
	* @return Response    返回类型
	* @author liuyijiao
	* @date 2015-10-20 上午10:02:30
	* @version V1.0
	* @throws
	 */
	private  static Response trainDelayQuery(String cz,String cc) throws Exception{
    	 String url="http://dynamic.12306.cn/map_zwdcx/cx.jsp";
    	 String czEn=URLEncoder.encode(cz,"utf-8");
    	 czEn=czEn.replaceAll("%", "-");
    	 cz=URLEncoder.encode(cz, "gbk");
    	 String cxlx="0";//0:到站 1：出发
    	 String rq=TimeUtil.getFormatedDate("yyyy-MM-dd");
    	 String tp = new Date().getTime()+"";
		 if (org.jsoup.helper.StringUtil.isBlank(url)) {
	            throw new Exception("The request URL is blank.");
	     }
		if(url.startsWith("https")){
			trustEveryone();
		}
		//get  方法
		//cz=%CA%AF%BC%D2%D7%AF  urlencode  gb2312 编码  石家庄   
		//czEn=-E7-9F-B3-E5-AE-B6-E5-BA-84 （%E7%9F%B3%E5%AE%B6%E5%BA%84） urlencode  utf-8 编码  石家庄 
		//  12306   js  源码
		/*var czEn = encodeURI(cz);//stono 90302
		czEn = czEn.replace(/%/g,"-"); //stono 90302
		var tp = new Date().getTime();
		*/
		//http://dynamic.12306.cn/map_zwdcx/cx.jsp?cz=%CA%AF%BC%D2%D7%AF&cc=G574&cxlx=0&rq=2015-10-19&czEn=-E7-9F-B3-E5-AE-B6-E5-BA-84&tp=1445248090669
		System.out.println(url+"?cz="+cz+"&cc="+cc+"&cxlx="+cxlx+"&rq="+rq+"&czEn="+czEn+"&tp="+tp);
		Response response = Jsoup.connect(url).data("cz",cz,"cc",cc,"cxlx",cxlx,"rq",rq,"czEn",czEn,"tp",tp).ignoreContentType(true).timeout(10000).method(Method.GET).execute();  
		return  response;
    }
	
	/**
	 * 
	* @Title: trainQuery
	* @Description: 车票查询
	* @param @param url
	* @param @return
	* @param @throws Exception    设定文件
	* @return Response    返回类型
	* @author liuyijiao
	* @date 2015-10-19 下午05:48:58
	* @version V1.0
	* @throws
	 */
    private  static Response trainQuery(String url,String date,String fromStation,String toStation) throws Exception{
    	//String url="https://kyfw.12306.cn/otn/leftTicket/query";
		 if (org.jsoup.helper.StringUtil.isBlank(url)) {
	            throw new Exception("The request URL is blank.");
	     }
		if(url.startsWith("https")){
			trustEveryone();
		}
		//get  方法
		Response response = Jsoup.connect(url+"?leftTicketDTO.train_date="+date+"&leftTicketDTO.from_station="+fromStation+"&leftTicketDTO.to_station="+toStation+"&purpose_codes=ADULT").userAgent("Mozilla/5.0 (Windows NT 6.1; WOW64; rv:40.0) Gecko/20100101 Firefox/40.0").ignoreContentType(true).timeout(10000).method(Method.GET).execute();  
		/*Map<String,String> cookieMap=new HashMap<String,String>();
		cookieMap.put("BIGipServerotn", "1943601418.24610.0000");  
		cookieMap.put("JSESSIONID", "0A01D973607BAF2255B7E0DBC04749C026D5B4C358");
		Document doc = Jsoup.connect(url+"?leftTicketDTO.train_date=2015-10-19&leftTicketDTO.from_station=SJP&leftTicketDTO.to_station=BJP&purpose_codes=ADULT").userAgent("Mozilla/5.0 (Windows NT 6.1; WOW64; rv:40.0) Gecko/20100101 Firefox/40.0")
					.cookies(cookieMap).ignoreContentType(true).timeout(10000) .get();    */
		//Document doc = Jsoup.connect("https://www.baidu.com").userAgent("Mozilla/5.0 (Windows NT 6.1; WOW64; rv:40.0) Gecko/20100101 Firefox/40.0").timeout(1000).get();
		return  response;
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
    /**
     *  将JSONObjec对象转换成Map-List集合
     * @param json
     * @return
     */
     public static Map<String, String> values2Map(String keys,String values){
         Map<String,String> columnValMap = new HashMap<String,String>();
         String[] jsonKeys = keys.split(",");
         String[] jsonValues = values.split(",");
         for (int i=0;i<jsonKeys.length;i++) {
             columnValMap.put(jsonKeys[i],jsonValues[i]);
        }
         return columnValMap;
     }
             
}
