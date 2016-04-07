package com.lyj.test;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileReader;
import java.io.IOException;

public class O1 {
	public static void main1(String[] args) {
		File file=new File("C:\\Users\\liuyijiao\\Desktop\\sort.txt");
		BufferedReader br = null;
		try {
			br=new BufferedReader(new FileReader(file));
			char[] b=new char[512*1024*148];
			while(br.read(b, 0, b.length)>0){
				System.out.println(b);
			}
		} catch (FileNotFoundException e) {
			e.printStackTrace();
		} catch (IOException e) {
			e.printStackTrace();
		}finally{
			try {
				br.close();
			} catch (IOException e) {
				e.printStackTrace();
			}
		}
	}
	public static void main(String[] args) {
		Runtime run = Runtime.getRuntime(); 
		//byte[] b=new byte[1024*1024*128];//fen pei le  128M
		long max = run.maxMemory()/(1024*1024); 

		long total = run.totalMemory()/(1024*1024); 

		long free = run.freeMemory()/(1024*1024); 

		long usable = max - total + free;
		
		/*byte[] b=new byte[1024*1024*1];
		for(int i=0;i<b.length;i++){
			b[i]=127;
			System.out.println(b[i]);
		}*/
		System.out.println("最大内存 = " + max+"M"); 
		System.out.println("已分配内存 = " + total+"M"); 
		System.out.println("已分配内存中的剩余空间 = " + free+"M"); 
		System.out.println("最大可用内存 = " + usable+"M"); 
	}
}
