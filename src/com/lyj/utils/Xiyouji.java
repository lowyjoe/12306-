package com.lyj.utils;

import java.io.IOException;
import java.net.MalformedURLException;
import java.net.URL;
import java.util.Scanner;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;

public class Xiyouji {
	public static void main(String[] args) throws IOException {
		// Document doc=
		// Jsoup.connect("http://www.guoxue.com/minqingstory/ss/syj_034.htm").userAgent("Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/33.0.1750.27 Safari/537.36").timeout(100*1000).get();
		int pageNum=Integer.valueOf(PropertiesUtil.getValueByKey("xiyouji.properties", "pageNum"));
		int saveI=Integer.valueOf(PropertiesUtil.getValueByKey("xiyouji.properties", "i"));
		System.out.println(pageNum);
		System.out.println(saveI);
		readDoc(saveI, pageNum);
	}
	 private static void readDoc(int saveI,int pageNum) throws MalformedURLException, IOException{
		 String url = "http://www.guoxue.com/minqingstory/ss/syj_0"+pageNum+".htm";
		 Document doc = Jsoup.parse(new URL(url).openStream(), "GBK", url);
		 char[] charText = doc.body().text().toCharArray();
			Scanner sc = new Scanner(System.in);
			System.out.println("《西游记》");
			System.out.println("按enter开始。。。。。");
			System.out.println("按q保存退出。。。。。");
			System.out.println("按n下一页。。。。。");
				 for (int i = saveI; i < charText.length; i++) {
					if (i!=0&&i % 50 == 0) {
						String nextStr=sc.nextLine();
					    if(nextStr.equals("q")){
							System.out.println("保存退出");
							PropertiesUtil.setValueByKey("xiyouji.properties", "pageNum",pageNum+"");
							PropertiesUtil.setValueByKey("xiyouji.properties", "i",i+"");
							System.exit(0);
						}else if(nextStr.equals("n")){
							System.out.println("下一页");
							pageNum=pageNum+1;
							saveI=0;//i重置为0
							readDoc(saveI, pageNum);
						}
					}
					System.out.print(charText[i]);
				} 
	 }
}
