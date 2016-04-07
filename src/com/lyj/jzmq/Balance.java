package com.lyj.jzmq;


import java.util.LinkedList;

import org.zeromq.ZFrame;
import org.zeromq.ZMQ;
import org.zeromq.ZMsg;

public class Balance {
	
	public static class Client {
		public void start() {
			new Thread(new Runnable(){

				public void run() {
					// TODO Auto-generated method stub
					ZMQ.Context context = ZMQ.context(1);
					ZMQ.Socket socket = context.socket(ZMQ.REQ);
					
					socket.connect("ipc://front");  //连接router，想起发送请求
					
					for (int i = 0; i < 1000; i++) {
						socket.send("hello".getBytes(), 0);  //发送hello请求
						String bb = new String(socket.recv());  //获取返回的数据
						System.out.println(bb);	
					}
					socket.close();
					context.term();
				}
				
			}).start();
		}
	}
	
	public static class Worker {
		public void start() {
			new Thread(new Runnable(){

				public void run() {
					// TODO Auto-generated method stub
					ZMQ.Context context = ZMQ.context(1);
					ZMQ.Socket socket = context.socket(ZMQ.REQ);
					
					socket.connect("ipc://back");  //连接，用于获取要处理的请求，并发送回去处理结果
					
					socket.send("ready");  //发送ready，表示当前可用
					 
					while (!Thread.currentThread().isInterrupted()) {
						ZMsg msg = ZMsg.recvMsg(socket);  //获取需要处理的请求，其实这里msg最外面的标志frame是router对分配给client的标志frame
						ZFrame request = msg.removeLast();   //最后一个frame其实保存的就是实际的请求数据，这里将其移除，待会用新的frame代替
						ZFrame frame = new ZFrame("hello fjs".getBytes());  
						msg.addLast(frame);  //将刚刚创建的frame放到msg的最后，worker将会收到
						msg.send(socket);  //将数据发送回去
						
					}
					socket.close();
					context.term();
				}
				
			}).start();
		}
	}
	
	public static class Middle {
		private LinkedList<ZFrame> workers;
		private LinkedList<ZMsg> requests;
		private ZMQ.Context context;
		private ZMQ.Poller poller;
		
		public Middle() {
			this.workers = new LinkedList<ZFrame>();
			this.requests = new LinkedList<ZMsg>();
			this.context = ZMQ.context(1);
			this.poller = new ZMQ.Poller(2);
		}
		
		public void start() {
			ZMQ.Socket fronted = this.context.socket(ZMQ.ROUTER);  //创建一个router，用于接收client发送过来的请求，以及向client发送处理结果
			ZMQ.Socket backend = this.context.socket(ZMQ.ROUTER);  //创建一个router，用于向后面的worker发送数据，然后接收处理的结果
			
			fronted.bind("ipc://front");  //监听，等待client的连接
			backend.bind("ipc://back");  //监听，等待worker连接
			
			//创建pollItem
			ZMQ.PollItem fitem = new ZMQ.PollItem(fronted, ZMQ.Poller.POLLIN);  
			ZMQ.PollItem bitem = new ZMQ.PollItem(backend, ZMQ.Poller.POLLIN);
			
			this.poller.register(fitem);  //注册pollItem
			this.poller.register(bitem);
			
			
			while (!Thread.currentThread().isInterrupted()) {
				this.poller.poll();
				if (fitem.isReadable()) {  //表示前面有请求发过来了
					ZMsg msg = ZMsg.recvMsg(fitem.getSocket());  //获取client发送过来的请求，这里router会在实际请求上面套一个连接的标志frame
					this.requests.addLast(msg);   //将其挂到请求队列
				}
				if (bitem.isReadable()) {  //这里表示worker发送数据过来了
					ZMsg msg = ZMsg.recvMsg(bitem.getSocket());  //获取msg，这里也会在实际发送的数据前面包装一个连接的标志frame
					//这里需要注意，这里返回的是最外面的那个frame，另外它还会将后面的接着的空的标志frame都去掉
					ZFrame workerID = msg.unwrap();  //把外面那层包装取下来，也就是router对连接的标志frame
					this.workers.addLast(workerID);  //将当前的worker的标志frame放到worker队列里面，表示这个worker可以用了
					ZFrame readyOrAddress = msg.getFirst(); //这里获取标志frame后面的数据，如果worker刚刚启动，那么应该是发送过来的ready，
					
					
					if (new String(readyOrAddress.getData()).equals("ready")) {  //表示是worker刚刚启动，发过来的ready
						msg.destroy();
					} else {
						msg.send(fronted);  //表示是worker处理完的返回结果，那么返回给客户端
					}
				}
				
				while (this.workers.size() > 0 && this.requests.size() > 0) {
					ZMsg request = this.requests.removeFirst();
					ZFrame worker = this.workers.removeFirst();
					
					request.wrap(worker);  //在request前面包装一层，把可以用的worker的标志frame包装上，这样router就会发给相应的worker的连接
					request.send(backend);  //将这个包装过的消息发送出去
				}
				
			}
			fronted.close();
			backend.close();
			this.context.term();
		}
	}
	
	
	public static void main(String args[]) {
		/*System.loadLibrary("jzmq");*/
		  Worker worker = new Worker();
		worker.start();
		Client client = new Client();
		client.start();
		Middle middle = new Middle();
		middle.start(); 
		
		
	}
}
