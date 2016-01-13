package com.lyj.utils;

import java.io.IOException;
import java.util.Random;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;

public class Qiushibaike {
	public static void main(String[] args) throws IOException {
		Random random=new Random();
		Document doc= Jsoup.connect("http://www.qiushibaike.com/8hr/page/"+random.nextInt(50)+"?s=4841982").userAgent("Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/33.0.1750.27 Safari/537.36").timeout(100*1000).get();
		System.out.println(doc.body().getElementsByClass("content"));
	}
}
