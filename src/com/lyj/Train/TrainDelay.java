package com.lyj.Train;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.select.Elements;

public class TrainDelay {

	/**
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
	public static void main(String[] args) throws IOException {
		Map<String,String> cookieMap=new HashMap<String,String>();
		cookieMap.put("BIGipServerotn", "1943601418.24610.0000");  
		cookieMap.put("JSESSIONID", "0A01D973607BAF2255B7E0DBC04749C026D5B4C358");
		Document doc = Jsoup.connect("https://kyfw.12306.cn/otn/leftTicket/query?leftTicketDTO.train_date=2015-09-10&leftTicketDTO.from_station=SJP&leftTicketDTO.to_station=BJP&purpose_codes=ADULT").userAgent("Mozilla/5.0 (Windows NT 6.1; WOW64; rv:40.0) Gecko/20100101 Firefox/40.0")
					.cookies(cookieMap).timeout(10000) .get();    
		//Document doc = Jsoup.connect("https://www.baidu.com").userAgent("Mozilla/5.0 (Windows NT 6.1; WOW64; rv:40.0) Gecko/20100101 Firefox/40.0").timeout(1000).get();
		System.out.println(doc.toString());

	}

}
