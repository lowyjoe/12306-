package com.lyj.test;

import java.io.File;

import com.lyj.utils.FileUtil;

public class  ThreadTest implements Runnable {

	public static void main(String[] args) {
		for(int i=0;i<9;i++){
			ThreadTest tt= new ThreadTest(i+"&");
			Thread t=new Thread(tt);
			t.start();
		}
	}
	

		private String name;
		public ThreadTest() {
			 
		}
		public ThreadTest(String name){
			this.name=name;
		}
		@Override
		public  void  run() {
			File f=new File("C:"+File.separator+"Users"+File.separator+"liuyijiao"+File.separator+"Desktop"+File.separator+"testFile.txt");
				if(name.endsWith("0")){
					try {
						Thread.currentThread().sleep(4000);
					} catch (InterruptedException e) {
						e.printStackTrace();
					}
				}
				// FileUtil.saveFile(f, "/n"+name, true);
				 String content=FileUtil.readFile(f);
				System.out.println(name+"run"+content);
		}
}
