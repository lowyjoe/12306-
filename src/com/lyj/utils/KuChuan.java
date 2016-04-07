package com.lyj.utils;

public class KuChuan {
	/**
	 * @param args
	 */
	public static void main(String[] args) {
		KuChuan tc = new KuChuan();
		Thread1 t1 = tc.new Thread1(tc);
		t1.start();
		Thread2 t2 = tc.new Thread2(tc);
		t2.start();
		
	}

	class Thread1 extends Thread{
		KuChuan tc = null;
		public Thread1(KuChuan tc) {
			this.tc = tc;
		}
		@Override
		public void run() {
			tc.method1();
		}
	}
	class Thread2 extends Thread{
		KuChuan tc = null;
		public Thread2(KuChuan tc) {
			this.tc = tc;
		}
		@Override
		public void run() {
			// TODO Auto-generated method stub
			tc.method2();
		}
	}
	
	public synchronized void method1(){
		System.out.println("method1");
		try {
			Thread.sleep(1000*10);
		} catch (InterruptedException e) {
			e.printStackTrace();
		}
	}
	public synchronized void method2(){
		System.out.println("method2");
	}
}