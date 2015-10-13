package com.sheyun;

import java.io.IOException;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;

public class QQEmailUSername {

	/**
	 * @throws IOException 
	 * @Title: main
	 * @Description: http://sheyun.org/index.html  来自社云网
	 * @param @param args     
	 * @return void    返回类型
	 * @author liuyijiao
	 * @date 2015-9-10 下午06:07:40
	 * @version V1.0
	 * @throws
	 */
	public static void main(String[] args) throws IOException {
		String query="447672467";
		Document doc = Jsoup.connect("http://api.sheyun.org/api.php?so="+query).userAgent("Mozilla/5.0 (Windows NT 6.1; WOW64; rv:40.0) Gecko/20100101 Firefox/40.0").timeout(10000) .get();
		System.out.println(doc.toString());
	}

}
