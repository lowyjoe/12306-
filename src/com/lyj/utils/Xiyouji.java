package com.lyj.utils;

import java.io.IOException;
import java.net.URL;
import java.util.Scanner;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;

public class Xiyouji {
	public static void main(String[] args) throws IOException {
		// Document doc=
		// Jsoup.connect("http://www.guoxue.com/minqingstory/ss/syj_034.htm").userAgent("Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/33.0.1750.27 Safari/537.36").timeout(100*1000).get();
		String url = "http://www.guoxue.com/minqingstory/ss/syj_034.htm";
		Document doc = Jsoup.parse(new URL(url).openStream(), "GBK", url);
		char[] charText = doc.body().text().toCharArray();
		Scanner sc = new Scanner(System.in);
		System.out.println("《西游记》");
		System.out.println("点击任意键按enter开始。。。。。");
		if (sc.hasNext()){
			for (int i = 0; i < charText.length; i++) {
				if (i!=0&&i % 50 == 0) {
					try {
						Thread.sleep(10000);
						System.out.println();
					} catch (InterruptedException e) {
						e.printStackTrace();
					}
				}
				System.out.print(charText[i]);
			}
		}
	}
}
